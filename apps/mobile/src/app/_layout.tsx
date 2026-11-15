import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { pulsDesign } from '@/constants/puls-design';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: pulsDesign.background },
        }}
      />
    </>
  );
}
