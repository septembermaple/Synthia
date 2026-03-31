export const config = {
  useAPI: import.meta.env.VITE_USE_API === 'true',
  apiURL: import.meta.env.VITE_API_URL || 'http://localhost:8787',
};

export default config;
