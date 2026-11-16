import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView as RNWebView, type WebViewMessageEvent } from 'react-native-webview';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { toBase64 } from '../admin/customers/download';

const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { postMessage: (data: string) => void };

/** One file in the viewer; `url` must already be absolute. */
export interface ViewerFile {
  url: string;
  name: string;
  contentType?: string | null;
}

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'other';

export function fileKind(f: ViewerFile): Kind {
  const t = (f.contentType ?? '').toLowerCase();
  const n = f.name.toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp|mkv)$/.test(n)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga)$/.test(n)) return 'audio';
  if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
  return 'other';
}

const FileViewerContext = createContext<((files: ViewerFile[], index?: number) => void) | null>(null);

/** Opens files in the in-app viewer (images, videos, audio, PDFs) with swipe between them. */
export function useFileViewer() {
  const open = useContext(FileViewerContext);
  if (!open) throw new Error('useFileViewer must be used inside FileViewerProvider');
  return open;
}

export function FileViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ files: ViewerFile[]; index: number; n: number } | null>(null);
  const open = useCallback((files: ViewerFile[], index = 0) => {
    const list = files.filter((f) => !!f.url);
    if (!list.length) return;
    setState((prev) => ({ files: list, index: Math.min(Math.max(index, 0), list.length - 1), n: (prev?.n ?? 0) + 1 }));
  }, []);
  return (
    <FileViewerContext.Provider value={open}>
      {children}
      {state ? <Viewer key={state.n} files={state.files} start={state.index} onClose={() => setState(null)} /> : null}
    </FileViewerContext.Provider>
  );
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';

/** Download to the cache (once per open) so it can be shared or opened in another app. */
async function downloadToCache(f: ViewerFile): Promise<File> {
  const dir = new Directory(Paths.cache, 'viewer');
  if (!dir.exists) dir.create({ idempotent: true });
  return File.downloadFileAsync(f.url, new File(dir, safeName(f.name)), { idempotent: true });
}

async function shareFile(f: ViewerFile) {
  const file = await downloadToCache(f);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const pdf = fileKind(f) === 'pdf';
  await Sharing.shareAsync(file.uri, {
    mimeType: f.contentType || (pdf ? 'application/pdf' : undefined),
    UTI: pdf ? 'com.adobe.pdf' : undefined,
    dialogTitle: f.name,
  });
}

function Viewer({ files, start, onClose }: { files: ViewerFile[]; start: number; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<ViewerFile>>(null);
  const [index, setIndex] = useState(start);
  const [sharing, setSharing] = useState(false);
  // While an image is zoomed in, a finger drag pans the image instead of changing page.
  const [zoomed, setZoomed] = useState(false);
  const current = files[index];
  const many = files.length > 1;

  const go = (to: number) => {
    if (to < 0 || to >= files.length) return;
    setIndex(to);
    list.current?.scrollToIndex({ index: to, animated: true });
  };

  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const v = viewableItems[0];
    if (v?.index != null) setIndex(v.index);
  }).current;

  const share = async () => {
    setSharing(true);
    try {
      await shareFile(current);
    } catch (e) {
      Alert.alert('Could not download the file', e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <Text style={styles.name} numberOfLines={1}>
            {current.name}
          </Text>
          {many ? (
            <View style={styles.count}>
              <Text style={styles.countText}>
                {index + 1} / {files.length}
              </Text>
            </View>
          ) : null}
          <Pressable onPress={share} disabled={sharing} style={styles.round} hitSlop={6} accessibilityLabel="Download or share">
            {sharing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="download-outline" size={19} color="#fff" />}
          </Pressable>
          <Pressable onPress={onClose} style={styles.round} hitSlop={6} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={{ flex: 1 }}>
          <FlatList
            ref={list}
            data={files}
            horizontal
            style={{ flex: 1 }}
            pagingEnabled
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={start}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(f, i) => `${i}:${f.url}`}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            windowSize={3}
            renderItem={({ item, index: i }) => (
              <View style={{ width, flex: 1, paddingBottom: insets.bottom + 8 }}>
                <Page file={item} active={i === index} onShare={share} sharing={sharing} onZoom={setZoomed} />
              </View>
            )}
          />
          {many && index > 0 ? (
            <Pressable onPress={() => go(index - 1)} style={[styles.arrow, { left: 8 }]} accessibilityLabel="Previous file">
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
          ) : null}
          {many && index < files.length - 1 ? (
            <Pressable onPress={() => go(index + 1)} style={[styles.arrow, { right: 8 }]} accessibilityLabel="Next file">
              <Ionicons name="chevron-forward" size={24} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Page({
  file,
  active,
  onShare,
  sharing,
  onZoom,
}: {
  file: ViewerFile;
  active: boolean;
  onShare: () => void;
  sharing: boolean;
  onZoom: (zoomed: boolean) => void;
}) {
  const kind = fileKind(file);
  if (kind === 'image') return <ImagePage file={file} active={active} onZoom={onZoom} />;
  // Players and PDFs only live on the page in view, so swiping away stops playback.
  if (!active) return <Centered><ActivityIndicator color="#fff" /></Centered>;
  if (kind === 'video' || kind === 'audio') return <MediaPage file={file} kind={kind} onShare={onShare} sharing={sharing} />;
  if (kind === 'pdf') return <PdfPage file={file} onShare={onShare} sharing={sharing} />;
  return <OtherPage file={file} onShare={onShare} sharing={sharing} note="This file type can’t be previewed in the app." />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MAX_ZOOM = 4;

/**
 * Pinch to zoom (up to 4×), drag to pan while zoomed, double-tap to zoom in / back out.
 * Built on PanResponder so it needs no extra native module.
 */
function ImagePage({ file, active, onZoom }: { file: ViewerFile; active: boolean; onZoom: (zoomed: boolean) => void }) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const box = useRef({ w: 0, h: 0 });
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const cur = useRef({ s: 1, x: 0, y: 0 });
  const start = useRef({ s: 1, x: 0, y: 0, dist: 0, gx: 0, gy: 0, pinching: false });
  const moved = useRef(false);
  const lastTap = useRef(0);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  const apply = (s: number, x: number, y: number, animate = false) => {
    const maxX = (box.current.w * (s - 1)) / 2;
    const maxY = (box.current.h * (s - 1)) / 2;
    const next = { s, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
    cur.current = next;
    if (!animate) {
      scale.setValue(next.s);
      tx.setValue(next.x);
      ty.setValue(next.y);
      return;
    }
    Animated.parallel([
      Animated.timing(scale, { toValue: next.s, duration: 180, useNativeDriver: true }),
      Animated.timing(tx, { toValue: next.x, duration: 180, useNativeDriver: true }),
      Animated.timing(ty, { toValue: next.y, duration: 180, useNativeDriver: true }),
    ]).start();
  };
  const reset = (animate: boolean) => {
    apply(1, 0, 0, animate);
    onZoomRef.current(false);
  };

  // Swiping to another file leaves this one at normal size.
  useEffect(() => {
    if (!active && cur.current.s !== 1) reset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Two fingers, or any drag while zoomed, belong to the image (not the pager).
      onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2 || cur.current.s > 1,
      onPanResponderGrant: () => {
        moved.current = false;
        start.current = { ...cur.current, dist: 0, gx: 0, gy: 0, pinching: false };
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > 8) moved.current = true;
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          const d = Math.hypot(t[0]!.pageX - t[1]!.pageX, t[0]!.pageY - t[1]!.pageY);
          if (!start.current.pinching || !start.current.dist) {
            start.current = { ...cur.current, dist: d || 1, gx: g.dx, gy: g.dy, pinching: true };
            onZoomRef.current(true);
            return;
          }
          apply(clamp((start.current.s * d) / start.current.dist, 1, MAX_ZOOM), start.current.x, start.current.y);
        } else if (cur.current.s > 1) {
          if (start.current.pinching) {
            // One finger lifted after a pinch: carry on as a pan from here.
            start.current = { ...cur.current, dist: 0, gx: g.dx, gy: g.dy, pinching: false };
          }
          apply(cur.current.s, start.current.x + g.dx - start.current.gx, start.current.y + g.dy - start.current.gy);
        }
      },
      onPanResponderRelease: () => {
        start.current.pinching = false;
        if (!moved.current) {
          const now = Date.now();
          if (now - lastTap.current < 300) {
            lastTap.current = 0;
            if (cur.current.s > 1) reset(true);
            else {
              apply(2.5, 0, 0, true);
              onZoomRef.current(true);
            }
            return;
          }
          lastTap.current = now;
        }
        if (cur.current.s < 1.05) reset(true);
      },
      // Not zoomed: let the pager take a horizontal swipe.
      onPanResponderTerminationRequest: () => cur.current.s <= 1 && !start.current.pinching,
      onPanResponderTerminate: () => {
        start.current.pinching = false;
        if (cur.current.s < 1.05) reset(true);
      },
    })
  ).current;

  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={(e) => (box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...responder.panHandlers}
    >
      <Animated.Image
        source={{ uri: file.url }}
        style={{ flex: 1, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}
        resizeMode="contain"
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
      />
      {state !== 'ok' ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          {state === 'loading' ? <ActivityIndicator color="#fff" /> : <Text style={styles.note}>Could not load this image.</Text>}
        </View>
      ) : null}
    </View>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function MediaPage({ file, kind, onShare, sharing }: { file: ViewerFile; kind: 'video' | 'audio'; onShare: () => void; sharing: boolean }) {
  const [failed, setFailed] = useState(false);
  // A format this phone can't play (e.g. HEVC .mov on some Androids): offer the other apps.
  const onErr = `onerror="window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('error')"`;
  const tag =
    kind === 'video'
      ? `<video src="${esc(file.url)}" controls autoplay playsinline ${onErr}></video>`
      : `<audio src="${esc(file.url)}" controls autoplay ${onErr}></audio>`;
  if (failed) {
    return <OtherPage file={file} onShare={onShare} sharing={sharing} note={`This ${kind} can’t be played in the app.`} />;
  }
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center}
video{max-width:100%;max-height:100%;width:100%}audio{width:92%}</style></head><body>${tag}</body></html>`;
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      onMessage={(e: WebViewMessageEvent) => e.nativeEvent.data === 'error' && setFailed(true)}
      javaScriptEnabled
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: '#000' }}
    />
  );
}

/** Big PDFs are slow to hand to the page as base64; offer the other apps instead. */
const PDF_INLINE_LIMIT = 15 * 1024 * 1024;

const PDF_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<style>html,body{margin:0;background:#1b1f26;font-family:-apple-system,Roboto,sans-serif}
#pages{padding:10px 10px 30px}canvas{display:block;width:100%;margin:0 auto 10px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4)}
#msg{padding:40px 20px;text-align:center;color:#cbd2dc;font-size:15px}</style></head>
<body><div id="pages"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
(function(){
  var post=function(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }
  async function load(b64){
    try{
      var bin=atob(b64), bytes=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      var doc=await pdfjsLib.getDocument({data:bytes}).promise;
      var box=document.getElementById('pages'), w=box.clientWidth-20, ratio=Math.min(window.devicePixelRatio||1,1.5);
      for(var p=1;p<=doc.numPages;p++){
        var page=await doc.getPage(p), base=page.getViewport({scale:1}), vp=page.getViewport({scale:(w/base.width)*ratio});
        var c=document.createElement('canvas'); c.width=vp.width; c.height=vp.height; box.appendChild(c);
        await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
        if(p===1) post({type:'loaded'});
      }
    }catch(e){ post({type:'error',message:String(e&&e.message||e)}); }
  }
  function onMsg(e){ try{ var m=JSON.parse(e.data); if(m.type==='load') load(m.pdf); }catch(_){} }
  document.addEventListener('message',onMsg);
  window.addEventListener('message',onMsg);
  post({type:'ready',libs:!!window.pdfjsLib});
})();
</script></body></html>`;

/** PDFs render with pdf.js on both platforms (Android's WebView can't show them, and iOS's shows nothing for files stored without a PDF type). */
function PdfPage({ file, onShare, sharing }: { file: ViewerFile; onShare: () => void; sharing: boolean }) {
  const web = useRef<WebViewHandle>(null);
  const [pdf, setPdf] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`The file could not be downloaded (${res.status}).`);
        const size = Number(res.headers.get('content-length') || 0);
        if (size > PDF_INLINE_LIMIT) throw new Error('This PDF is too large to preview in the app.');
        const buf = await res.arrayBuffer();
        if (buf.byteLength > PDF_INLINE_LIMIT) throw new Error('This PDF is too large to preview in the app.');
        if (live) setPdf(toBase64(buf));
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [file.url]);

  useEffect(() => {
    if (pdf && ready) web.current?.postMessage(JSON.stringify({ type: 'load', pdf }));
  }, [pdf, ready]);

  // A stalled download or viewer script shouldn't leave the spinner up forever.
  useEffect(() => {
    if (loaded || error) return;
    const t = setTimeout(() => setError('The PDF took too long to load. Check your internet connection.'), 45_000);
    return () => clearTimeout(t);
  }, [loaded, error]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type: string; libs?: boolean; message?: string };
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === 'ready') {
      if (m.libs) setReady(true);
      else setError('Could not load the PDF viewer. Check your internet connection.');
    } else if (m.type === 'loaded') setLoaded(true);
    else if (m.type === 'error') setError(m.message || 'Could not show this PDF.');
  };

  if (error) return <OtherPage file={file} onShare={onShare} sharing={sharing} note={error} />;
  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html: PDF_HTML, baseUrl: 'https://cdnjs.cloudflare.com/' }}
        onMessage={onMessage}
        onRenderProcessGone={() => setError('This PDF is too large to preview in the app.')}
        onContentProcessDidTerminate={() => setError('This PDF is too large to preview in the app.')}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: '#1b1f26' }}
      />
      {!loaded ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

function OtherPage({ file, note, onShare, sharing }: { file: ViewerFile; note: string; onShare: () => void; sharing: boolean }) {
  return (
    <Centered>
      <View style={styles.card}>
        <Ionicons name="document-outline" size={40} color="#2DB98A" />
        <Text style={[styles.note, { color: '#0B1F3A', fontWeight: '600', marginTop: 10 }]} numberOfLines={2}>
          {file.name}
        </Text>
        <Text style={[styles.note, { color: '#5B6B80', marginTop: 6 }]}>{note}</Text>
        <Pressable onPress={onShare} disabled={sharing} style={styles.cta}>
          {sharing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ctaText}>Open in another app</Text>}
        </Pressable>
      </View>
    </Centered>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1117' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  name: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  count: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { color: '#fff', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  note: { color: '#cbd2dc', fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', maxWidth: 320, width: '100%' },
  cta: { marginTop: 16, backgroundColor: '#0B1F3A', borderRadius: 10, height: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  ctaText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
