/// <reference types="astro/client" />

declare module "*.svg?raw" {
  const source: string;
  export default source;
}

declare namespace App {
  interface Locals {
    preview: boolean;
    appOrigin: string;
  }
}
