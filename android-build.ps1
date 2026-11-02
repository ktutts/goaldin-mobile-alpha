$env:GRADLE_USER_HOME="C:\GradleFresh"

cd android

.\gradlew.bat assembleDebug --no-daemon --max-workers=1 --no-parallel --no-watch-fs