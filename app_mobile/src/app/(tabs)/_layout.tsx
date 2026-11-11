import { Stack, Redirect } from "expo-router";
import { useMobile } from "../../context/mobile-context";
import { theme } from "../../components/mobile-ui";

export default function TabsLayout() {
  const { session, booting } = useMobile();
  if (booting) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: "slide_from_right",
        animationDuration: 220,
      }}
    >
      <Stack.Screen name="home" />
      <Stack.Screen name="bots" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="content" />
      <Stack.Screen name="more" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
