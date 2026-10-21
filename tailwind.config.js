/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' (not the default 'media'): NativeWind's web runtime throws on startup in media mode.
  // Native still follows the system scheme; the root layout mirrors it onto <html> on web.
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: {} },
  plugins: [],
};
