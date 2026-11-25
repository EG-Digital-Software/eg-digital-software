import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { TabBar, type TabMeta } from '../tabBar';
import { Sheet } from '../ui';
import NotificationsScreen from '../screens/NotificationsScreen';
import CustomerPickerScreen from '../screens/CustomerPickerScreen';
import { AdminThreadScreen } from './shared';
import type { AdminRoute } from './types';
import * as dashboard from './dashboard';
import * as customers from './customers';
import * as tasks from './tasks';
import * as billing from './billing';
import * as team from './team';
import * as products from './products';
import * as vault from './vault';
import * as feedback from './feedback';
import * as company from './company';
import * as settings from './settings';
import AdminMenu from './more/AdminMenu';
import AdminProfileScreen from './more/AdminProfileScreen';

const Tab = createBottomTabNavigator();

const TABS: TabMeta = {
  Dashboard: { label: 'Dashboard', icon: 'grid-outline', iconOn: 'grid' },
  Customers: { label: 'Customers', icon: 'business-outline', iconOn: 'business' },
  Tasks: { label: 'Tasks', icon: 'list-outline', iconOn: 'list' },
  Billing: { label: 'Billing', icon: 'receipt-outline', iconOn: 'receipt' },
};

/** Two tabs each side of the EG Eloma logo; the logo opens the full admin menu. */
function AdminNavBar(props: BottomTabBarProps) {
  const [menu, setMenu] = useState(false);
  const go = (name: string, params?: object) => {
    setMenu(false);
    props.navigation.navigate(name, params);
  };
  return (
    <>
      <TabBar {...props} tabs={TABS} center={{ onPress: () => setMenu(true), open: menu }} />
      <Sheet open={menu} onClose={() => setMenu(false)}>
        <AdminMenu go={go} onClose={() => setMenu(false)} />
      </Sheet>
    </>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator
      tabBar={(p) => <AdminNavBar {...p} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#fff' } }}
    >
      <Tab.Screen name="Dashboard" component={dashboard.Home} />
      <Tab.Screen name="Customers" component={customers.Home} />
      <Tab.Screen name="Tasks" component={tasks.Home} />
      <Tab.Screen name="Billing" component={billing.Home} />
    </Tab.Navigator>
  );
}

/** Root-stack screens of the admin app ("Main" is the tabs, as in the client app). */
export const adminRootScreens: AdminRoute[] = [
  { name: 'Main', component: AdminTabs },
  { name: 'AdminThread', component: AdminThreadScreen },
  { name: 'Notifications', component: NotificationsScreen },
  { name: 'Profile', component: AdminProfileScreen },
  { name: 'CustomerPicker', component: CustomerPickerScreen },
  ...dashboard.routes,
  ...customers.routes,
  ...tasks.routes,
  ...billing.routes,
  ...team.routes,
  ...products.routes,
  ...vault.routes,
  ...feedback.routes,
  ...company.routes,
  ...settings.routes,
];
