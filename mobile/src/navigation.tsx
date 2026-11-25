import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { registerPush, targetOf, type PushTarget } from './lib/push';
import { getSession, setSession } from './api/client';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TabBar } from './tabBar';
import { adminRootScreens } from './admin/AdminApp';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { useBoard } from './lib/queries';
import { unreadCount, useSeenVersion } from './lib/seen';
import { needsSignature, useProfile } from './lib/portal';
import { Bird, Sheet, T, useKeyboardVisible, type IconName } from './ui';
import { colors } from './theme';

import LoginScreen from './screens/LoginScreen';
import OverviewScreen from './screens/OverviewScreen';
import TasksScreen from './screens/TasksScreen';
import TaskDetailScreen from './screens/TaskDetailScreen';
import ChatsScreen from './screens/ChatsScreen';
import TaskChatScreen from './screens/TaskChatScreen';
import AgreementsScreen from './screens/AgreementsScreen';
import AgreementViewerScreen from './screens/AgreementViewerScreen';
import ClientMenu from './screens/ClientMenu';
import ProductsScreen from './screens/ProductsScreen';
import InvoicesScreen from './screens/InvoicesScreen';
import CompanyScreen from './screens/CompanyScreen';
import ProfileScreen from './screens/ProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen';

const Root = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const TasksStack = createNativeStackNavigator();

const plain = { headerShown: false, contentStyle: { backgroundColor: '#fff' } } as const;

function TasksNav() {
  return (
    <TasksStack.Navigator screenOptions={plain}>
      <TasksStack.Screen name="TasksList" component={TasksScreen} />
      <TasksStack.Screen name="Task" component={TaskDetailScreen} />
    </TasksStack.Navigator>
  );
}

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName }> = {
  Overview: { label: 'Overview', icon: 'home-outline', iconOn: 'home' },
  Tasks: { label: 'Tasks', icon: 'list-outline', iconOn: 'list' },
  Chats: { label: 'Chats', icon: 'chatbubble-outline', iconOn: 'chatbubble' },
  Agreements: { label: 'Agreements', icon: 'create-outline', iconOn: 'create' },
};

function NavBar(props: BottomTabBarProps) {
  const { user } = useAuth();
  const { tasks } = useBoard();
  const profile = useProfile();
  useSeenVersion();
  const unreadTasks = tasks.filter((t) => unreadCount(t, user?.id) > 0).length;
  const unreadMsgs = tasks.reduce((n, t) => n + unreadCount(t, user?.id), 0);
  const toSign = (profile.data?.documents ?? []).filter(needsSignature).length;
  const badges: Record<string, [number, string]> = {
    Tasks: [unreadTasks, colors.red],
    Chats: [unreadMsgs, colors.red],
    Agreements: [toSign, colors.amber],
  };
  // The logo in the middle opens the menu (Products, Invoices, Company, Profile).
  const [menu, setMenu] = useState(false);
  const go = (name: string) => {
    setMenu(false);
    props.navigation.navigate(name);
  };
  return (
    <>
      <TabBar {...props} tabs={TABS} badges={badges} center={{ onPress: () => setMenu(true), open: menu }} />
      <Sheet open={menu} onClose={() => setMenu(false)}>
        <ClientMenu go={go} onClose={() => setMenu(false)} />
      </Sheet>
    </>
  );
}

function Tabs() {
  return (
    <Tab.Navigator tabBar={(p) => <NavBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#fff' } }}>
      <Tab.Screen name="Overview" component={OverviewScreen} />
      <Tab.Screen name="Tasks" component={TasksNav} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Agreements" component={AgreementsScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#fff', primary: colors.navy, card: '#fff', text: colors.fg, border: colors.line },
};

function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <Bird size={96} />
    </View>
  );
}

const navRef = createNavigationContainerRef<any>();

/**
 * Phone notifications: registers this phone once signed in, refreshes data when
 * one arrives while the app is open, and opens the right screen when one is
 * tapped — including the tap that launched the app from closed.
 */
function usePushNotifications(signedIn: boolean, accountKey: string | null) {
  const qc = useQueryClient();
  const pending = useRef<PushTarget | null>(null);

  const open = (target: PushTarget | null) => {
    if (!target) return;
    const s = getSession();
    if (s?.admin) {
      // An admin looking at a customer's portal: the push is the admin's own.
      if (target.name === 'Thread' && target.params.clientId === s.admin.clientId) {
        pending.current = null;
        navRef.navigate('Thread', { taskId: target.params.taskId });
        return;
      }
      // Anything else: back to the admin app, then open it there.
      pending.current = target;
      setSession({ user: s.admin.user, accessToken: s.admin.accessToken, refreshToken: s.admin.refreshToken ?? null });
      return;
    }
    const names = navRef.isReady() ? navRef.getRootState()?.routeNames ?? [] : [];
    if (names.includes('AdminThread')) {
      // Admin app: a task push carries its customer, so open that task's chat;
      // anything else opens the notifications list.
      pending.current = null;
      if (target.name === 'Thread' && target.params.clientId) {
        navRef.navigate('AdminThread', { clientId: target.params.clientId, taskId: target.params.taskId });
      } else {
        navRef.navigate('Notifications');
      }
      return;
    }
    if (!names.includes(target.name)) {
      // Not signed in / still on the admin picker: open it once we can.
      pending.current = target;
      return;
    }
    pending.current = null;
    if (target.name === 'Notifications' || target.name === 'Invoices') navRef.navigate(target.name);
    else navRef.navigate(target.name, target.params);
  };

  // Register this phone for the signed-in account.
  useEffect(() => {
    if (signedIn) void registerPush({ ask: true });
  }, [signedIn, accountKey]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      // New message / update while the app is open: fetch the fresh data.
      void qc.invalidateQueries();
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => {
      open(targetOf(r.notification.request.content.data as Record<string, unknown>));
    });
    // The tap that started the app from closed.
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) open(targetOf(r.notification.request.content.data as Record<string, unknown>));
    });
    return () => {
      received.remove();
      tapped.remove();
    };
    // open() only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const openRef = useRef(open);
  openRef.current = open;
  /** Call when the navigator (re)mounts, e.g. after sign-in. */
  return useCallback(() => {
    if (pending.current) openRef.current(pending.current);
  }, []);
}

export default function Navigation() {
  const { ready, user, admin } = useAuth();
  const qc = useQueryClient();
  const signedIn = !!user;
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const flushPending = usePushNotifications(signedIn, admin?.user.id ?? user?.id ?? null);

  // Nothing from one account may linger into the next.
  useEffect(() => {
    if (!signedIn) qc.clear();
  }, [signedIn, qc]);

  // A notification tapped before sign-in opens once the portal is showing.
  useEffect(() => {
    if (signedIn) setTimeout(flushPending, 300);
  }, [signedIn, isAdmin, flushPending]);

  if (!ready) return <Splash />;
  return (
    <NavigationContainer ref={navRef} theme={navTheme} onReady={flushPending}>
      <Root.Navigator screenOptions={plain}>
        {!user ? (
          <Root.Screen name="Login" component={LoginScreen} />
        ) : isAdmin ? (
          adminRootScreens.map((r) => <Root.Screen key={r.name} name={r.name} component={r.component} />)
        ) : (
          <>
            <Root.Screen name="Main" component={Tabs} />
            <Root.Screen name="Thread" component={TaskChatScreen} />
            <Root.Screen name="AgreementSign" component={AgreementViewerScreen} />
            <Root.Screen name="AgreementPreview" component={AgreementViewerScreen} />
            <Root.Screen name="Notifications" component={NotificationsScreen} />
            <Root.Screen name="Products" component={ProductsScreen} />
            <Root.Screen name="Invoices" component={InvoicesScreen} />
            <Root.Screen name="Company" component={CompanyScreen} />
            <Root.Screen name="Profile" component={ProfileScreen} />
          </>
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}

