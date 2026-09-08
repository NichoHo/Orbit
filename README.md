# Orbit

Orbit is a cross-platform, offline-first task and habit tracking engine. Built with Expo, it delivers a lightning-fast native experience where every action renders immediately, with synchronization to Postgres happening transparently in the background.

## Features

- **Lightning Fast & Offline First:** Built with an offline-first architecture using TanStack Query and MMKV. The app never waits on the network; your tasks and habits are always available, even on airplane mode.
- **Full-Text Task Search:** Quickly find any task with powerful, native full-text search backed by Postgres GIN indexing.
- **Agenda View:** An intuitive chronological week view to help you focus on upcoming tasks based on their due dates.
- **Local Reminders:** Deterministic local notifications for due dates and habit cadences, keeping you on track without relying on external push servers.
- **Insights & Stats:** Visualize your productivity with built-in stats screens detailing your completion rates, trends, and habit streaks.
- **Data Ownership:** Easily export all your data to CSV format and share it anywhere via the native OS share sheet.
- **Home-Screen Widgets:** Keep your pending tasks front and center with native iOS home-screen widgets built via WidgetKit.

## Architecture

Orbit relies on a strictly defined tech stack optimized for offline-first resilience:
- **Framework:** Expo (React Native) + Expo Router
- **State & Sync:** TanStack Query (server state) + Zustand (UI state)
- **Database:** Supabase (Postgres 15+, RLS, Realtime)
- **Local Storage:** `react-native-mmkv` with `expo-secure-store`
- **Styling:** NativeWind (Tailwind CSS)

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

To run the native iOS widget, you must build the app natively using EAS Build or local Xcode compilation (`npx expo prebuild`).
