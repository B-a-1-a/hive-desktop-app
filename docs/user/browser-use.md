# Browser use

Browser use lets an agent work in a browser that is already installed on your
computer, such as Google Chrome, Microsoft Edge, or Brave. The agent opens its
own window, and you can watch an orange pointer move, click, and type while it
works. It is separate from the Browser panel inside Hive.

## Turn it on

Open **Settings → Browser → Browser use**.

1. Turn on **Let agents use a browser on this computer**. The first time, Hive
   downloads agent-browser, the open-source tool that drives the browser.
2. Under **Browser agents use**, choose a browser. Hive lists the browsers it
   finds on this computer.

Browser use is off until you turn it on. Only Chromium-based browsers (Chrome,
Edge, Brave, Arc, Chromium, and Vivaldi) can be used. Firefox and Safari are
listed but cannot be chosen yet.

## What to expect

- Each window has a fresh, empty profile. The agent is not signed in to your
  accounts, and it never uses your own browser windows or profile.
- Several windows can be open at the same time, from one thread or many. They
  do not share sign-ins, cookies, or tabs.
- The agent closes its window when it is done. To close one yourself, use
  **Close window** next to it in **Settings → Browser → Browser use**. Quitting
  Hive closes every window it opened.
- Hive looks for browsers on macOS, Windows, and Linux. On Windows and Linux,
  browsers installed in unusual folders are not found yet.
- Browser use runs on the computer where Hive's server runs. When you connect
  from another device, the window opens on that computer, not on the device in
  your hand.
