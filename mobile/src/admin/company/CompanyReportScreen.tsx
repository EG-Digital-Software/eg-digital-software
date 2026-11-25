import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Print from 'expo-print';
import { AppBar, Btn, Muted } from '../../ui';
import { colors } from '../../theme';
import { COMPANY_REPORT_HTML } from './companyReportHtml';

const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { reload: () => void };

export type CompanyView = 'mkt' | 'azure';

// Print is handed to the app (expo-print); window.open is a no-op.
const SHIM = `(function(){
  var send=function(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  window.open=function(u){ if(u) send({open:String(u)}); return null; };
  window.print=function(){ var c=document.documentElement.cloneNode(true); c.querySelectorAll('script').forEach(function(s){s.remove();}); send({print:'<!DOCTYPE html>'+c.outerHTML}); };
})(); true;`;

/**
 * Marketing and Cloud (web admin tabs): EG Eloma's own report page in a WebView.
 * `view` picks which part opens first, as on the web.
 */
export default function CompanyReportScreen() {
  const route = useRoute<any>();
  const view: CompanyView = route.params?.view === 'azure' ? 'azure' : 'mkt';
  const web = useRef<WebViewHandle>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html = COMPANY_REPORT_HTML.replace('<body>', `<body data-view="${view}">`);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { print?: string; open?: string };
      if (m.print) void Print.printAsync({ html: m.print }).catch(() => undefined);
      if (m.open && /^https?:\/\//.test(m.open)) void Linking.openURL(m.open);
    } catch {
      /* not ours */
    }
  };

  // Links to outside sites open in the phone's browser, not inside the report.
  const onNav = (req: { url: string }) => {
    if (req.url.startsWith('https://localhost') || req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
    if (/^(https?|mailto|tel):/.test(req.url)) {
      void Linking.openURL(req.url).catch(() => Alert.alert('Could not open link', req.url));
      return false;
    }
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppBar title={view === 'azure' ? 'Cloud' : 'Marketing'} back />
      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
          <Muted style={{ textAlign: 'center' }}>{error}</Muted>
          <Btn
            title="Try again"
            onPress={() => {
              setError(null);
              setLoaded(false);
              web.current?.reload();
            }}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={view}
            ref={web}
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://localhost/' }}
            injectedJavaScriptBeforeContentLoaded={SHIM}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onNav}
            onLoadEnd={() => setLoaded(true)}
            onError={(ev: { nativeEvent: { description?: string } }) => setError(`Could not open the report: ${ev.nativeEvent.description ?? 'error'}`)}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            style={{ flex: 1, backgroundColor: '#fff' }}
          />
          {!loaded ? (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
              <ActivityIndicator color={colors.green} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
