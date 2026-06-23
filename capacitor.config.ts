import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quest.app',
  appName: 'Quest',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
