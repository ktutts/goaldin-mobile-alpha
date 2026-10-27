-- GOAL'D IN · CIRCLE: additional network + goal-specific invitations (phase 1)
-- ADDITIVE migration: does not replace public.connections, circle_members(),
-- profiles, goals, wins, or any legacy sharing policies/functions.
-- PREREQUISITE: prior Circle schema installed (profiles, connections, cheers, notes).
-- NO direct SELECT permission on someone else's goals is introduced.
-- Review and run once in Supabase SQL Editor after backing up your database.
BEGIN;

CREATE TABLE IF NOT EXISTS public.network_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS goald_network_pair_unique
ON public.network_connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS goald_network_incoming ON public.network_connections(addressee_id, status);
ALTER TABLE public.network_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "network party reads own" ON public.network_connections;
CREATE POLICY "network party reads own" ON public.network_connections
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
-- No INSERT / UPDATE / DELETE policies: writes are validated in the RPCs below.

CREATE TABLE IF NOT EXISTS public.network_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_to_help boolean NOT NULL DEFAULT false,
  help_topics text[] NOT NULL DEFAULT '{}',
  help_modes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goald_help_topics_limit CHECK (cardinality(help_topics) <= 8),
  CONSTRAINT goald_help_modes_limit CHECK (cardinality(help_modes) <= 4)
);
ALTER TABLE public.network_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "network preferences own read" ON public.network_preferences;
CREATE POLICY "network preferences own read" ON public.network_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- All preference changes go through save_network_preferences().

CREATE TABLE IF NOT EXISTS public.goal_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('supporter','advisor','teammate')),
  access_scope text NOT NULL CHECK (access_scope IN ('title_only','current_move')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 160),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, invitee_id),
  CHECK (owner_id <> invitee_id)
);
CREATE INDEX IF NOT EXISTS goald_goal_team_invitee ON public.goal_team_invites(invitee_id, status);
ALTER TABLE public.goal_team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "goal team parties read invitations" ON public.goal_team_invites;
CREATE POLICY "goal team parties read invitations" ON public.goal_team_invites
  FOR SELECT TO authenticated USING (owner_id = auth.uid() OR invitee_id = auth.uid());
-- No raw mutation policies. In particular, invitees cannot widen their access scope.

-- Short, goal-specific notes, only within an accepted goal invitation.
CREATE TABLE IF NOT EXISTS public.goal_team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.goal_team_invites(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goald_team_messages_by_invite ON public.goal_team_messages(invite_id, created_at DESC);
ALTER TABLE public.goal_team_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team messages only parties" ON public.goal_team_messages;
CREATE POLICY "team messages only parties" ON public.goal_team_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.goal_team_invites i WHERE i.id=invite_id
      AND i.status='accepted' AND (i.owner_id=auth.uid() OR i.invitee_id=auth.uid()))
  );

-- Membership check is ONLY about accepted direct relationships; it never
-- authorizes access to goals or recordings on its own.
CREATE OR REPLACE FUNCTION public.goald_network_connected(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a IS NOT NULL AND b IS NOT NULL AND (a = auth.uid() OR b = auth.uid()) AND EXISTS (
    SELECT 1 FROM public.network_connections n
    WHERE n.status = 'accepted'
    AND ((n.requester_id = a AND n.addressee_id = b)
      OR (n.requester_id = b AND n.addressee_id = a))
  );
$$;

CREATE OR REPLACE FUNCTION public.request_network_connection(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := auth.uid(); target uuid;
  code text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF length(code) <> 12 THEN RAISE EXCEPTION 'Enter a 12-character invite code.'; END IF;
  SELECT id INTO target FROM public.profiles WHERE invite_code = code;
  IF target IS NULL OR target = me THEN RAISE EXCEPTION 'That code is not available.'; END IF;
  IF EXISTS (SELECT 1 FROM public.connections c
    WHERE c.status = 'accepted' AND ((c.requester_id = me AND c.addressee_id = target)
    OR (c.requester_id = target AND c.addressee_id = me))) THEN
    RAISE EXCEPTION 'This person is already in your Inner 5.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.network_connections n WHERE
    (n.requester_id = me AND n.addressee_id = target) OR
    (n.requester_id = target AND n.addressee_id = me)) THEN
    RAISE EXCEPTION 'Already connected or waiting for approval.';
  END IF;
  IF (SELECT count(*) FROM public.network_connections WHERE requester_id = me AND status = 'pending') >= 15 THEN
    RAISE EXCEPTION 'Too many invitations waiting for approval.';
  END IF;
  INSERT INTO public.network_connections (requester_id,addressee_id) VALUES (me,target);
  RETURN 'sent';
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_network_connection(p_conn uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n public.network_connections%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.network_connections WHERE id = p_conn
    AND addressee_id = auth.uid() AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found.'; END IF;
  IF p_accept THEN
    UPDATE public.network_connections SET status = 'accepted' WHERE id = n.id;
  ELSE
    DELETE FROM public.network_connections WHERE id = n.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_network_connection(p_conn uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n public.network_connections%ROWTYPE;
BEGIN
  SELECT * INTO n FROM public.network_connections WHERE id=p_conn
    AND (requester_id=auth.uid() OR addressee_id=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found.'; END IF;
  -- Revoke team invites between parties before removing the relationship.
  DELETE FROM public.goal_team_invites i WHERE
    (i.owner_id=n.requester_id AND i.invitee_id=n.addressee_id)
    OR (i.owner_id=n.addressee_id AND i.invitee_id=n.requester_id);
  DELETE FROM public.network_connections WHERE id=p_conn;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_network_preferences(p_available boolean, p_topics text[], p_modes text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t text[]; m text[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  SELECT coalesce(array_agg(DISTINCT left(btrim(v),32)), '{}') INTO t
    FROM unnest(coalesce(p_topics,'{}'::text[])) v WHERE btrim(v) <> '';
  SELECT coalesce(array_agg(DISTINCT v), '{}') INTO m
    FROM unnest(coalesce(p_modes,'{}'::text[])) v
    WHERE v IN ('encouragement','advice','hands_on','accountability');
  IF cardinality(t)>8 THEN RAISE EXCEPTION 'Choose up to 8 topics.'; END IF;
  INSERT INTO public.network_preferences(user_id,available_to_help,help_topics,help_modes,updated_at)
  VALUES (auth.uid(),coalesce(p_available,false),t,m,now())
  ON CONFLICT (user_id) DO UPDATE SET available_to_help=EXCLUDED.available_to_help,
    help_topics=EXCLUDED.help_topics,help_modes=EXCLUDED.help_modes,updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION public.network_members()
RETURNS TABLE (conn_id uuid, member_id uuid, display_name text, tagline text, status text, incoming boolean,
               available_to_help boolean, help_topics text[], help_modes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT n.id, p.id, p.display_name, p.tagline, n.status,
    (n.addressee_id=auth.uid()),
    (n.status='accepted' AND coalesce(np.available_to_help,false)),
    CASE WHEN n.status='accepted' AND np.available_to_help THEN np.help_topics ELSE '{}'::text[] END,
    CASE WHEN n.status='accepted' AND np.available_to_help THEN np.help_modes ELSE '{}'::text[] END
  FROM public.network_connections n
  JOIN public.profiles p ON p.id = CASE WHEN n.requester_id=auth.uid() THEN n.addressee_id ELSE n.requester_id END
  LEFT JOIN public.network_preferences np ON np.user_id=p.id
  WHERE n.requester_id=auth.uid() OR n.addressee_id=auth.uid()
  ORDER BY n.created_at DESC LIMIT 150;
$$;

CREATE OR REPLACE FUNCTION public.my_network_preferences()
RETURNS TABLE(available_to_help boolean,help_topics text[],help_modes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(np.available_to_help,false), coalesce(np.help_topics,'{}'::text[]),coalesce(np.help_modes,'{}'::text[])
  FROM (SELECT auth.uid() AS id) u LEFT JOIN public.network_preferences np ON np.user_id=u.id
  WHERE u.id IS NOT NULL;
$$;

-- Only the owner can invite, and only their real, nonarchived goal is eligible.
-- The person invited must already be an accepted direct contact (Inner 5 or Network).
CREATE OR REPLACE FUNCTION public.invite_goal_teammate(p_goal uuid,p_member uuid,p_role text,p_scope text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE me uuid:=auth.uid(); msg text:=left(trim(coalesce(p_note,'')),160);
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first.'; END IF;
  IF p_role NOT IN ('supporter','advisor','teammate') OR p_scope NOT IN ('title_only','current_move') THEN
    RAISE EXCEPTION 'Choose a valid role and visibility level.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.goals g WHERE g.id=p_goal AND g.user_id=me
    AND g.status='active' AND g.archived_at IS NULL AND g.completed_at IS NULL) THEN
    RAISE EXCEPTION 'Choose one of your active goals.';
  END IF;
  IF p_member=me OR NOT (public.are_connected(me,p_member) OR public.goald_network_connected(me,p_member)) THEN
    RAISE EXCEPTION 'Invite a person from your accepted Inner 5 or Network.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.goal_team_invites WHERE goal_id=p_goal AND invitee_id=p_member) THEN
    RAISE EXCEPTION 'An invitation already exists for this goal and person.';
  END IF;
  INSERT INTO public.goal_team_invites(goal_id,owner_id,invitee_id,role,access_scope,note)
  VALUES(p_goal,me,p_member,p_role,p_scope,msg);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_goal_teammate(p_invite uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.goal_team_invites%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.goal_team_invites WHERE id=p_invite AND invitee_id=auth.uid()
    AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal invitation not found.'; END IF;
  IF p_accept THEN
    IF NOT (public.are_connected(i.owner_id,auth.uid()) OR public.goald_network_connected(i.owner_id,auth.uid())) THEN
      RAISE EXCEPTION 'The connection is no longer active.';
    END IF;
    UPDATE public.goal_team_invites SET status='accepted' WHERE id=i.id;
  ELSE
    DELETE FROM public.goal_team_invites WHERE id=i.id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_goal_teammate(p_invite uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  DELETE FROM public.goal_team_invites WHERE id=p_invite
   AND (owner_id=auth.uid() OR invitee_id=auth.uid());
END;
$$;

-- Each user sees only invitations involving them. No raw WHY, progress
-- history, media, heart/sleep data, or private notes are returned.
CREATE OR REPLACE FUNCTION public.my_goal_team()
RETURNS TABLE(invite_id uuid,goal_id uuid,goal_title text,person_id uuid,person_name text,
  role text,access_scope text,status text,incoming boolean,invitation_note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT i.id,i.goal_id,g.title,p.id,p.display_name,i.role,i.access_scope,i.status,
    (i.invitee_id=auth.uid()),i.note
  FROM public.goal_team_invites i
  JOIN public.goals g ON g.id=i.goal_id
  JOIN public.profiles p ON p.id = CASE WHEN i.owner_id=auth.uid() THEN i.invitee_id ELSE i.owner_id END
  WHERE (i.owner_id=auth.uid() OR i.invitee_id=auth.uid())
    AND (i.owner_id=auth.uid() OR public.are_connected(i.owner_id,auth.uid())
      OR public.goald_network_connected(i.owner_id,auth.uid()))
  ORDER BY i.created_at DESC LIMIT 100;
$$;

-- Optional limited look at the CURRENT MOVE, only when the goal owner
-- explicitly granted this scope, recipient accepted, and still connected.
CREATE OR REPLACE FUNCTION public.my_goal_team_moves()
RETURNS TABLE(goal_id uuid,move_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT i.goal_id,
   (SELECT a.title FROM public.actions a WHERE a.goal_id=i.goal_id AND a.status='pending'
     ORDER BY a.position,a.created_at LIMIT 1)
  FROM public.goal_team_invites i JOIN public.goals g ON g.id=i.goal_id
  WHERE i.invitee_id=auth.uid() AND i.status='accepted' AND i.access_scope='current_move'
    AND g.status='active' AND g.archived_at IS NULL AND g.completed_at IS NULL
    AND (public.are_connected(i.owner_id,auth.uid()) OR public.goald_network_connected(i.owner_id,auth.uid()))
  LIMIT 100;
$$;

-- Quiet, purposeful communication. No unlimited feed or unsolicited group blast.
-- Each participant may send ONE short message per goal team every 24 hours.
CREATE OR REPLACE FUNCTION public.send_goal_team_message(p_invite uuid,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.goal_team_invites%ROWTYPE; msg text:=btrim(coalesce(p_message,''));
BEGIN
  IF char_length(msg) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Messages are 1 to 160 characters.'; END IF;
  SELECT * INTO i FROM public.goal_team_invites WHERE id=p_invite AND status='accepted'
    AND (owner_id=auth.uid() OR invitee_id=auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Join this goal before sending a note.'; END IF;
  IF NOT (public.are_connected(i.owner_id,i.invitee_id) OR public.goald_network_connected(i.owner_id,i.invitee_id)) THEN
    RAISE EXCEPTION 'This connection is no longer active.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_invite::text || auth.uid()::text));
  IF EXISTS (SELECT 1 FROM public.goal_team_messages m WHERE m.invite_id=p_invite
    AND m.sender_id=auth.uid() AND m.created_at > now() - interval '24 hours') THEN
    RAISE EXCEPTION 'You already sent a message on this goal in the past 24 hours.';
  END IF;
  INSERT INTO public.goal_team_messages(invite_id,sender_id,message) VALUES(p_invite,auth.uid(),msg);
END;
$$;

CREATE OR REPLACE FUNCTION public.my_goal_team_messages()
RETURNS TABLE(message_id uuid,invite_id uuid,from_name text,message text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT m.id,m.invite_id,p.display_name,m.message,m.created_at
  FROM public.goal_team_messages m JOIN public.goal_team_invites i ON i.id=m.invite_id
    JOIN public.profiles p ON p.id=m.sender_id
  WHERE (i.owner_id=auth.uid() OR i.invitee_id=auth.uid()) AND i.status='accepted'
    AND (public.are_connected(i.owner_id,i.invitee_id) OR public.goald_network_connected(i.owner_id,i.invitee_id))
    AND m.created_at > now() - interval '30 days'
  ORDER BY m.created_at DESC LIMIT 80;
$$;

-- Restrict SECURITY DEFINER endpoints to signed-in accounts.
REVOKE ALL ON FUNCTION public.goald_network_connected(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_network_connection(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.respond_network_connection(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.remove_network_connection(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_network_preferences(boolean,text[],text[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.network_members() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_network_preferences() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.invite_goal_teammate(uuid,uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.respond_goal_teammate(uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.remove_goal_teammate(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_goal_team() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_goal_team_moves() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.send_goal_team_message(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_goal_team_messages() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.goald_network_connected(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_network_connection(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_network_connection(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_network_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_network_preferences(boolean,text[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.network_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_network_preferences() TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_goal_teammate(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_goal_teammate(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_goal_teammate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_goal_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_goal_team_moves() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_goal_team_message(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_goal_team_messages() TO authenticated;
COMMIT;
