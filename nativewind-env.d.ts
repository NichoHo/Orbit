/// <reference types="nativewind/types" />

// Metro turns the Tailwind entry into styles via withNativeWind; TypeScript
// still needs to be told the side-effect import resolves to something.
declare module '*.css';
