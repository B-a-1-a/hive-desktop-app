# Computer use

Computer use lets an agent see and operate the apps open on the computer Hive
runs on, such as Finder, Notes, or a spreadsheet app. It reads each app's
on-screen controls and clicks or types on them. A cursor appears on your screen
for each action, so you can watch what the agent does.

Computer use is in an early stage. Agents do not yet ask before they send,
buy, or delete something, so turn it on only for work you can watch.

## Turn it on

Open **Settings → Computer use** and turn on **Let agents use apps on this
computer**. The first time, Hive downloads the agent-desktop tool it uses to
read and operate apps. Turn the setting off at any time; Hive stops every app
session at once.

Computer use works on macOS and Linux. On Windows, the page says it is not
available yet.

## Permissions

On macOS, Hive needs **Accessibility** permission to operate other apps. The
**Permissions** section shows whether it is allowed. If it says **Not
allowed**, open **System Settings → Privacy & Security → Accessibility**, turn
on Hive, and choose **Check again**. **Screen Recording** is only needed for
screenshots of an app.

On Linux, the desktop's accessibility service must be running in the same
session as Hive.

## Watch and stop agents

Each time an agent starts working in an app, it opens a session for that app.
Several agents can work in different apps at the same time. **Settings →
Computer use → Apps in use** lists each session's app and its most recent
actions. Choose **Refresh** to update the list, and **Stop** to end a session.
Hive also ends every session when it quits.

Computer use operates only the computer the Hive server runs on. When you use
Hive from another device, agents operate the server's computer, not yours.
