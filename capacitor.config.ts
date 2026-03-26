import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.convoy',
  appName: 'convoy-connecter',
  webDir: 'dist',
  server: {
    url: 'https://3daeaddb-d8a4-43b7-a3e1-65f295916c62.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
