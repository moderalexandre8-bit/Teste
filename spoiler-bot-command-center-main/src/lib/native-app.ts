import { Capacitor } from "@capacitor/core";
import { registerDevicePushToken, unregisterDevicePushToken } from "@/lib/notifications.functions";

let pushListenersInstalled = false;
let activePushUserId: string | null = null;
let registeredPushToken: string | null = null;

export async function initializeNativeApp() {
  if (!Capacitor.isNativePlatform()) return;

  const [{ App }, { AppLauncher }, { Style, StatusBar }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/app-launcher"),
    import("@capacitor/status-bar"),
  ]);

  await StatusBar.setOverlaysWebView({ overlay: true });
  await StatusBar.setBackgroundColor({ color: "#101323" });
  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.hide();

  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }

    void App.exitApp();
  });

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target !== "_blank") return;

      const destination = new URL(link.href, window.location.href);
      if (destination.protocol !== "https:" && destination.protocol !== "http:") return;

      event.preventDefault();
      void AppLauncher.openUrl({ url: destination.href })
        .then(({ completed }) => {
          if (!completed) {
            console.error(`Android could not open external link: ${destination.origin}`);
          }
        })
        .catch((error: unknown) => {
          console.error("Could not open external link from the Android app", error);
        });
    },
    true,
  );
}

export async function registerNativePushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  activePushUserId = userId;

  const [{ App }, { LocalNotifications }, { PushNotifications }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/local-notifications"),
    import("@capacitor/push-notifications"),
  ]);

  if (!pushListenersInstalled) {
    pushListenersInstalled = true;
    await PushNotifications.addListener("registration", async ({ value }) => {
      registeredPushToken = value;
      if (!activePushUserId) return;
      try {
        await registerDevicePushToken({ data: { token: value } });
      } catch (error) {
        console.error("Could not register this Android device for Pix notifications", error);
      }
    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.error("Android push registration failed", error);
    });

    await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
      if (!(await App.getState()).isActive) return;
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.trunc(Date.now() % 2_147_483_647),
              title: notification.title ?? "TigerBot",
              body: notification.body ?? "Você tem uma nova atualização de vendas.",
              schedule: { at: new Date(Date.now() + 250) },
              channelId: "pix-alerts",
              smallIcon: "ic_stat_tigerbot",
              iconColor: "#f59e0b",
              extra: notification.data,
            },
          ],
        });
      } catch (error) {
        console.error("Could not display the Pix notification on this Android device", error);
      }
    });
  }

  await LocalNotifications.createChannel({
    id: "pix-alerts",
    name: "Vendas e Pix",
    description: "Avisos de Pix gerados e pagamentos confirmados",
    importance: 5,
    sound: "default",
    vibration: true,
    lights: true,
    lightColor: "#e89bb6",
  });

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    console.info("Pix push notifications are disabled because permission was not granted.");
    return;
  }

  await PushNotifications.register();
}

export async function unregisterNativePushNotifications() {
  activePushUserId = null;
  const token = registeredPushToken;
  registeredPushToken = null;
  if (!token || !Capacitor.isNativePlatform()) return;

  try {
    await unregisterDevicePushToken({ data: { token } });
  } catch (error) {
    console.error("Could not unregister this Android device's push token", error);
  }
}
