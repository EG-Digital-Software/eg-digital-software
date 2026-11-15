import React from 'react';
import { useRoute } from '@react-navigation/native';
import { TaskScope } from '../context/ScopeContext';
import TaskChatScreen from '../screens/TaskChatScreen';

/** The shared task chat, against one customer's board as the admin. */
export function AdminThreadScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  return (
    <TaskScope clientId={clientId}>
      <TaskChatScreen />
    </TaskScope>
  );
}

/** Wrap any screen whose route params carry `clientId` in that customer's task scope. */
export function withTaskScope<P extends object>(Screen: React.ComponentType<P>) {
  return function Scoped(props: P) {
    const route = useRoute<any>();
    return (
      <TaskScope clientId={route.params?.clientId}>
        <Screen {...props} />
      </TaskScope>
    );
  };
}
