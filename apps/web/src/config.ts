// Where the browser reaches the API (TS-08), read when the server starts, so one build serves any host (TS-110).
// The server takes `API_URL` (default: the local API that `bun dev` starts, TS-06) and renders it into every page
// (`apiUrlMeta`, in the root route's head); the browser reads it back from there.

const localApiUrl = "http://localhost:3001";

/** The `<meta>` the root route renders, so the browser learns the API origin the server was given. */
export const apiUrlMeta = "tonaris:api-url";

function readApiUrl(): string {
  if (typeof document === "undefined") {
    if (process.env.API_URL) return process.env.API_URL;
    if (process.env.NODE_ENV === "production")
      throw new Error("Set API_URL in production (see .env.example).");
    return localApiUrl;
  }
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${apiUrlMeta}"]`);
  return meta?.content || localApiUrl;
}

export const apiUrl: string = readApiUrl();
