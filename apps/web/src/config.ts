// Where the browser reaches the API (TS-08): `VITE_API_URL`, fixed when the web app is built, or the local API
// that `bun dev` starts (TS-06).

const configured: unknown = import.meta.env.VITE_API_URL;

export const apiUrl: string =
  typeof configured === "string" && configured !== "" ? configured : "http://localhost:3001";
