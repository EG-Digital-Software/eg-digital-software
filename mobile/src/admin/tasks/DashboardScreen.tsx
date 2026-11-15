import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Print from 'expo-print';
import { errorMessage } from '../../api/client';
import { fileUrl } from '../../api/tasks';
import type { ReportKind } from '../../api/admin/tasks';
import { AppBar, Btn, Muted } from '../../ui';
import { colors } from '../../theme';
import { shareTextFile, useAdminApi } from './common';
import { REPORT_HTML } from './reportHtml';
import { SOCIAL_HTML } from './socialHtml';

const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { injectJavaScript: (js: string) => void; reload: () => void };

export type DashboardKind = 'social' | ReportKind;

const TITLE: Record<DashboardKind, string> = {
  social: 'Social Media Dashboard',
  seo: 'SEO Dashboard',
  local: 'Local Listing',
  azure: 'Azure Performance',
};

/**
 * Runs before the page's own scripts. The web pages talk to their host with
 * `parent.postMessage` and only accept replies whose source is `parent` — in a
 * WebView the page is the top window, so `parent === window`. Requests are sent
 * to React Native instead; replies come back through `__rnReply`. Downloads
 * (CSV templates/exports) and print are handed to the app as well, and
 * window.open is a no-op (the app opens the Meta sign-in itself).
 */
const SHIM = `(function(){
  var send=function(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  var origPost=window.postMessage.bind(window);
  window.postMessage=function(d){ if(d&&(d.__rd||d.__sd)){ send({bridge:d}); return; } return origPost.apply(window,arguments); };
  window.__rnReply=function(m){ window.dispatchEvent(new MessageEvent('message',{data:m,source:window})); };
  window.open=function(){ return null; };
  window.print=function(){ var c=document.documentElement.cloneNode(true); c.querySelectorAll('script').forEach(function(s){s.remove();}); send({print:'<!DOCTYPE html>'+c.outerHTML}); };
  var blobs={}; var oc=URL.createObjectURL.bind(URL);
  URL.createObjectURL=function(b){ var u=oc(b); blobs[u]=b; return u; };
  var click=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
    var b=blobs[this.href];
    if(b&&this.download){ var name=this.download; var r=new FileReader(); r.onload=function(){ send({download:{name:name,text:String(r.result),type:b.type||'text/plain'}}); }; r.readAsText(b); return; }
    return click.call(this);
  };
  window.onerror=function(msg){ send({error:String(msg)}); };
})(); true;`;

/** Post pictures stored locally come back as "/uploads/…" — make them absolute for the page. */
function withMediaUrls(result: unknown): unknown {
  const r = result as { posts?: { img?: string | null }[] } | null;
  if (!r || !Array.isArray(r.posts)) return result;
  return { ...r, posts: r.posts.map((p) => ({ ...p, img: p.img ? fileUrl(p.img) : null })) };
}

/**
 * Route AdminTaskDashboard { clientId, taskId, kind } — the web's full
 * Social Media Dashboard or SEO/Local/Azure report page (same HTML), with the
 * API calls made by the app on the admin's session.
 */
export default function AdminTaskDashboardScreen() {
  const route = useRoute<any>();
  const clientId: string = route.params?.clientId;
  const taskId: string = route.params?.taskId;
  const kind: DashboardKind = route.params?.kind ?? 'social';
  const api = useAdminApi(clientId);
  const web = useRef<WebViewHandle>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const qc = useQueryClient();
  // Refresh the task tab's summary with whatever was edited here.
  useEffect(
    () => () => void qc.invalidateQueries({ queryKey: ['admin-tasks', clientId, kind === 'social' ? 'social' : 'report', taskId] }),
    [qc, clientId, kind, taskId]
  );

  const reply = (m: Record<string, unknown>) => web.current?.injectJavaScript(`window.__rnReply(${JSON.stringify(m)});true;`);

  const handle = useCallback(
    async (type: string, payload: Record<string, unknown>): Promise<unknown> => {
      if (kind !== 'social') {
        if (type === 'load') return api.report(taskId, kind);
        if (type === 'save') return api.saveReport(taskId, kind, payload);
        throw new Error('Unknown request');
      }
      switch (type) {
        case 'load':
          return withMediaUrls(await api.social(taskId));
        case 'sync':
          return withMediaUrls(await api.syncSocial(taskId));
        case 'save':
          return api.saveSocial(taskId, payload);
        case 'saveMetrics':
          return api.saveSocialMetrics(taskId, Array.isArray(payload.rows) ? payload.rows : []);
        case 'connect': {
          const r = await api.connectSocial(taskId, String(payload.provider ?? ''));
          // The page's own window.open is disabled — sign in to Meta in the browser.
          if (r?.url) await Linking.openURL(r.url);
          return r;
        }
        case 'select': {
          const { id, ...body } = payload;
          return api.selectSocialAccounts(taskId, String(id ?? ''), body);
        }
        case 'disconnect':
          return api.disconnectSocial(taskId, String(payload.id ?? ''));
        default:
          throw new Error('Unknown request');
      }
    },
    [api, kind, taskId]
  );

  const onMessage = async (e: WebViewMessageEvent) => {
    let m: {
      bridge?: { id: number; type: string; payload?: Record<string, unknown>; __sd?: boolean; __rd?: boolean };
      print?: string;
      download?: { name: string; text: string; type: string };
      error?: string;
    };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.bridge) {
      const b = m.bridge;
      const tag = b.__sd ? '__sdr' : '__rdr';
      try {
        const result = await handle(b.type, b.payload ?? {});
        reply({ [tag]: true, id: b.id, ok: true, result });
      } catch (err) {
        reply({ [tag]: true, id: b.id, ok: false, error: errorMessage(err) });
      }
    } else if (m.download) {
      await shareTextFile(m.download.name, m.download.text, m.download.type.split(';')[0] || 'text/plain');
    } else if (m.print) {
      try {
        await Print.printAsync({ html: m.print });
      } catch (err) {
        Alert.alert('Could not print', errorMessage(err));
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar title={TITLE[kind]} back />
      {error ? (
        <View style={{ padding: 24, gap: 12 }}>
          <Muted size={14} style={{ textAlign: 'center' }}>
            {error}
          </Muted>
          <Btn
            title="Try again"
            onPress={() => {
              setError(null);
              setLoaded(false);
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={attempt}
            ref={web}
            originWhitelist={['*']}
            source={{ html: kind === 'social' ? SOCIAL_HTML : REPORT_HTML, baseUrl: 'https://localhost/' }}
            injectedJavaScriptBeforeContentLoaded={SHIM}
            onMessage={onMessage}
            onLoadEnd={() => setLoaded(true)}
            onError={(ev: { nativeEvent: { description?: string } }) => setError(`Could not open the dashboard: ${ev.nativeEvent.description ?? 'network error'}`)}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess
            setSupportMultipleWindows={false}
            style={{ flex: 1, backgroundColor: '#fff' }}
          />
          {!loaded ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
              <ActivityIndicator color={colors.navy} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
