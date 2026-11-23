// The Worker's bindings from wrangler.jsonc and its settings. (`wrangler types` can generate
// these, but its file also redefines fetch, Response, etc. for the whole project, which
// breaks browser code.)
declare module 'cloudflare:workers' {
  export const env: {
    DB: import('@cloudflare/workers-types').D1Database;
    PHOTOS: import('@cloudflare/workers-types').R2Bucket;
    /** "yourteam.cloudflareaccess.com" */
    ACCESS_TEAM_DOMAIN?: string;
    /** the Access application's audience tag */
    ACCESS_AUD?: string;
    /** emails allowed to use the editor, comma-separated */
    EDITORS?: string;
  };
}

declare namespace App {
  interface Locals {
    viewer: import('./server/auth/viewer').Viewer | null;
  }
}
