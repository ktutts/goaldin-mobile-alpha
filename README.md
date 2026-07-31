# GOAL'D IN Android Alpha 0.1

React Native + Expo mobile app using Supabase for authentication and cloud data.

## What works
- Passwordless email sign-in
- Today screen
- Create a goal
- Automatically generates starter actions locally (AI-ready replacement point)
- Mark next action done
- Automatically completes goal and creates a Win when all actions are done
- Stores behavior events in Supabase
- Discover starter screen
- Win history and native Share sheet
- User profile / sign out
- Android package id and iOS bundle id: `com.mygoaldin.app`

## 1. Database
Open your Supabase project -> SQL Editor and run `supabase/schema.sql`.

## 2. Environment
Copy `.env.example` to `.env` and add your Supabase publishable key:

```
EXPO_PUBLIC_SUPABASE_URL=https://ciikqvdymzctdyjcxcgr.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_KEY
```

The publishable key is safe for client use when Row Level Security is correctly configured. Never add a service role key here.

## 3. Auth deep link
In Supabase Authentication -> URL Configuration, add:

`goaldin://today`

as an allowed redirect URL.

## 4. Run on Android with Expo Go
Install Node.js LTS on a computer, then:

```
npm install
npx expo start
```

Install Expo Go on the Android phone and scan the QR code.

## 5. Build an installable Android APK

```
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

The `preview` profile in `eas.json` builds an APK for direct installation/testing.

## 6. Google Play build

```
eas build --platform android --profile production
```

Production Android builds use an AAB suitable for Google Play.

## Next product work
1. Replace starter action generator in `app/goal-it.tsx` with a secure Supabase Edge Function calling AI.
2. Add public shareable Win pages and Do This Too cloning.
3. Add event-derived recommendations using completed/skipped/saved behavior.
4. Add push notifications only when there is a meaningful next move.
5. Add image upload for completed Wins.
