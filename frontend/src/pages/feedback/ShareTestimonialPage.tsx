import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { PageHeader } from '@/components/shared/misc';
import { feedbackApi, USE_LABELS, type TestimonialUse } from '@/api/feedback';
import { Monogram } from './feedbackUi';
import { errMsg, fieldLabel, initialsOf, sectionStyle } from './feedbackFmt';

const MAX_SECONDS = 60;
const STEPS = ['Your words', 'Video (optional)', 'Approve'];
const PROMISES = [
  'Nothing is published until you approve the final wording.',
  'You choose exactly where it can be used.',
  'Change or remove it any time from your Feedback page.',
  'Your video is only shown where you allow it.',
];

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Vid = { state: 'idle' } | { state: 'rec'; seconds: number } | { state: 'done'; blob: Blob; url: string; seconds: number };

export default function ShareTestimonialPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['client', 'feedback'], queryFn: feedbackApi.client });
  const [step, setStep] = useState(1);
  const [problem, setProblem] = useState('');
  const [change, setChange] = useState('');
  const [recommend, setRecommend] = useState('');
  // null = untouched, so the profile's name/company fill in once loaded.
  const [personNameIn, setPersonName] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [companyNameIn, setCompanyName] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uses, setUses] = useState<TestimonialUse[]>(['WEBSITE', 'PROPOSALS']);
  const [honest, setHonest] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [vid, setVid] = useState<Vid>({ state: 'idle' });
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const data = q.data;
  const personName = personNameIn ?? data?.me.firstName ?? '';
  const companyName = companyNameIn ?? data?.company.label ?? '';

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => () => stopStream(), []);
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const startRecording = async () => {
    setCamError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCamError('This browser cannot record video. You can skip this step.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        void videoRef.current.play().catch(() => undefined);
      }
      const type = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 1_500_000 } : undefined);
      const chunks: Blob[] = [];
      const started = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const seconds = Math.round((Date.now() - started) / 1000);
        stopStream();
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        setVid({ state: 'done', blob, url: URL.createObjectURL(blob), seconds });
      };
      recRef.current = rec;
      rec.start(1000);
      setVid({ state: 'rec', seconds: 0 });
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        if (s >= MAX_SECONDS) {
          if (rec.state === 'recording') rec.stop();
        } else setVid({ state: 'rec', seconds: s });
      }, 250);
    } catch {
      stopStream();
      setCamError('We could not open your camera. Check the browser permission, or skip this step.');
    }
  };
  const stopRecording = () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  };
  const reRecord = () => {
    if (vid.state === 'done') URL.revokeObjectURL(vid.url);
    setVid({ state: 'idle' });
    void startRecording();
  };

  const hasWords = !!(problem.trim() || change.trim() || recommend.trim());
  const quote = [problem, change, recommend]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .join(' ');

  const next1 = () => {
    setError(null);
    if (!personName.trim()) return setError('Add your name');
    if (!companyName.trim()) return setError('Add your company');
    setStep(2);
  };
  const next2 = () => {
    if (vid.state === 'rec') stopRecording();
    if (!hasWords && vid.state !== 'done') return setError('Write a few words in step 1, or record a short video');
    setError(null);
    setStep(3);
  };

  const finish = async () => {
    setError(null);
    if (!honest) return setError('Please confirm these are your own honest views');
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      let videoUrl: string | null = null;
      if (photo) photoUrl = (await feedbackApi.uploadTestimonialFile(photo, photo.name, 'photo')).url;
      if (vid.state === 'done') {
        const ext = vid.blob.type.includes('mp4') ? 'mp4' : 'webm';
        setProgress(0);
        videoUrl = (await feedbackApi.uploadTestimonialFile(vid.blob, `testimonial.${ext}`, 'video', setProgress)).url;
      }
      await feedbackApi.createTestimonial({
        problem: problem.trim() || null,
        change: change.trim() || null,
        recommend: recommend.trim() || null,
        personName: personName.trim(),
        jobTitle: jobTitle.trim() || null,
        companyName: companyName.trim(),
        photoUrl,
        videoUrl,
        videoSeconds: vid.state === 'done' ? vid.seconds : null,
        uses,
        honest: true,
      });
      qc.invalidateQueries({ queryKey: ['client', 'feedback'] });
      setStep(4);
    } catch (e) {
      setError(errMsg(e, 'Could not send your testimonial'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const mgr = data?.accountManager;
  const mgrFirst = mgr?.firstName || 'Your account manager';

  return (
    <div className="ec-page">
      <div className="crumbs up" style={{ margin: 0 }}>
        <span>
          <Link to="/client/feedback">Feedback</Link> / <b style={{ color: 'var(--fg)' }}>Share a testimonial</b>
        </span>
        {data && <span>{data.company.name}</span>}
      </div>
      <PageHeader
        eyebrow={data?.company.name?.toUpperCase() || 'FEEDBACK'}
        title="Share a testimonial"
        description="A few words about working with us that we can share with businesses like yours. About 3 minutes. Nothing goes public until you approve the final version."
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {step < 4 && (
            <ol aria-label="Steps" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {STEPS.map((label, i) => {
                const n = i + 1;
                const cur = step === n;
                const past = step > n;
                return (
                  <li key={label}>
                    <button
                      type="button"
                      aria-current={cur ? 'step' : undefined}
                      onClick={() => n < step && setStep(n)}
                      className="glass"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        minHeight: 48,
                        padding: '0 14px',
                        borderRadius: 12,
                        fontSize: 14,
                        textAlign: 'left',
                        cursor: n < step ? 'pointer' : 'default',
                        color: 'inherit',
                        border: `1px solid ${cur ? 'var(--fg)' : 'rgba(var(--w), 0.1)'}`,
                        fontWeight: cur ? 500 : 400,
                      }}
                    >
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          flex: 'none',
                          background: cur ? 'var(--btn)' : past ? 'var(--brand)' : 'rgba(var(--w), 0.1)',
                          color: cur ? 'var(--btnT)' : past ? '#fff' : 'inherit',
                        }}
                      >
                        {past ? <Check size={14} /> : n}
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          <section className="glass up" style={{ ...sectionStyle, padding: 24, gap: 16 }}>
            {step === 1 && (
              <>
                <div>
                  <h2 className="disp" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
                    In your own words
                  </h2>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Answer one, two or all three. Short is great.
                  </span>
                </div>
                <label style={fieldLabel}>
                  What was the problem before you worked with us?
                  <textarea className="inp" rows={2} maxLength={2000} value={problem} onChange={(e) => setProblem(e.target.value)} />
                </label>
                <label style={fieldLabel}>
                  What changed for your business?
                  <textarea className="inp" rows={2} maxLength={2000} value={change} onChange={(e) => setChange(e.target.value)} />
                </label>
                <label style={fieldLabel}>
                  Would you recommend EG Eloma? Why?
                  <textarea className="inp" rows={2} maxLength={2000} value={recommend} onChange={(e) => setRecommend(e.target.value)} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                  <label style={fieldLabel}>
                    Name
                    <input className="inp" maxLength={120} value={personName} onChange={(e) => setPersonName(e.target.value)} />
                  </label>
                  <label style={fieldLabel}>
                    Job title
                    <input className="inp" maxLength={120} placeholder="e.g. Director" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                  </label>
                  <label style={fieldLabel}>
                    Company
                    <input className="inp" maxLength={200} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                  </label>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: '1px dashed rgba(var(--w), 0.2)',
                    borderRadius: 12,
                    padding: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                  ) : (
                    <Monogram text={initialsOf(personName || '?')} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 140 }}>
                    <span style={{ fontSize: 14 }}>Company logo or your photo</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      Optional · PNG or JPG
                    </span>
                  </div>
                  <label className="btn bg" style={{ cursor: 'pointer' }}>
                    {photo ? 'Change' : 'Upload'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        if (f.size > 10 * 1024 * 1024) return toast.error('Pick an image under 10 MB');
                        setPhoto(f);
                        setPhotoPreview(URL.createObjectURL(f));
                      }}
                    />
                  </label>
                </div>
                {error && <span style={{ color: 'var(--rT)', fontSize: 13 }}>{error}</span>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn bp" type="button" onClick={next1}>
                    Continue
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <h2 className="disp" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
                    Add a short video <span className="muted" style={{ fontSize: 14 }}>(optional)</span>
                  </h2>
                  <span className="muted" style={{ fontSize: 13 }}>
                    30–60 seconds from your laptop or phone. You can re-record as many times as you like.
                  </span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '16 / 9',
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: '#0F1B2D',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {vid.state === 'done' ? (
                    <video src={vid.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: vid.state === 'rec' ? 'block' : 'none' }} />
                  )}
                  {vid.state === 'idle' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16, textAlign: 'center' }}>
                      <span style={{ opacity: 0.8, fontSize: 14 }}>Camera preview appears here</span>
                      <button className="btn" type="button" onClick={startRecording} style={{ background: '#fff', color: '#0F1B2D' }}>
                        Start recording
                      </button>
                    </div>
                  )}
                  {vid.state === 'rec' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: 999, alignSelf: 'flex-start' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                        Recording · {fmtClock(vid.seconds)} / {fmtClock(MAX_SECONDS)}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, background: 'rgba(0,0,0,0.5)', padding: '6px 12px', borderRadius: 10, textAlign: 'center' }}>
                          Prompt: What changed for your business after working with us?
                        </span>
                        <button className="btn" type="button" onClick={stopRecording} style={{ background: '#EF4444', color: '#fff' }}>
                          Stop
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {vid.state === 'done' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>Video saved · {fmtClock(vid.seconds)}</span>
                    <button className="btn bg sm" type="button" onClick={reRecord}>
                      Re-record
                    </button>
                  </div>
                )}
                {camError && <span style={{ color: 'var(--rT)', fontSize: 13 }}>{camError}</span>}
                {error && <span style={{ color: 'var(--rT)', fontSize: 13 }}>{error}</span>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn bg"
                    type="button"
                    onClick={() => {
                      stopRecording();
                      setStep(1);
                    }}
                  >
                    Back
                  </button>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {vid.state !== 'done' && (
                      <button
                        className="btn bg"
                        type="button"
                        onClick={() => {
                          stopRecording();
                          if (!hasWords) return setError('Write a few words in step 1, or record a short video');
                          setError(null);
                          setStep(3);
                        }}
                      >
                        Skip video
                      </button>
                    )}
                    <button className="btn bp" type="button" onClick={next2} disabled={vid.state === 'rec'}>
                      Continue
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <h2 className="disp" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
                    Check it and choose where we can use it
                  </h2>
                  <span className="muted" style={{ fontSize: 13 }}>
                    This is exactly how it will look. If we ever tidy the wording, we'll send it back to you first.
                  </span>
                </div>
                <figure style={{ margin: 0, border: '1px solid rgba(var(--w), 0.1)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 0.6, color: 'var(--brand)' }}>
                    “
                  </span>
                  <blockquote style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{quote || '(Video testimonial)'}</blockquote>
                  {vid.state === 'done' && <video src={vid.url} controls playsInline style={{ width: '100%', borderRadius: 10, maxHeight: 280, background: '#000' }} />}
                  <figcaption style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {photoPreview ? (
                      <img src={photoPreview} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
                    ) : (
                      <Monogram text={initialsOf(personName)} />
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {personName}
                        {jobTitle.trim() ? ` · ${jobTitle.trim()}` : ''}
                      </span>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {companyName}
                      </span>
                    </span>
                  </figcaption>
                </figure>
                <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>EG Eloma may use my testimonial on</legend>
                  {(Object.keys(USE_LABELS) as TestimonialUse[]).map((u) => (
                    <label key={u} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, minHeight: 32 }}>
                      <input
                        type="checkbox"
                        checked={uses.includes(u)}
                        onChange={() => setUses((l) => (l.includes(u) ? l.filter((x) => x !== u) : [...l, u]))}
                      />
                      {USE_LABELS[u]}
                    </label>
                  ))}
                </fieldset>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                  <input type="checkbox" checked={honest} onChange={(e) => setHonest(e.target.checked)} style={{ marginTop: 2 }} />
                  These are my own honest views. I haven't been paid or given anything for this testimonial.
                </label>
                {progress !== null && <span className="muted" style={{ fontSize: 13 }}>Uploading video… {progress}%</span>}
                {error && <span style={{ color: 'var(--rT)', fontSize: 13 }}>{error}</span>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <button className="btn bg" type="button" onClick={() => setStep(2)} disabled={busy}>
                    Back
                  </button>
                  <button className="btn bp" type="button" onClick={finish} disabled={busy || !honest}>
                    {busy ? 'Sending…' : 'Approve & send'}
                  </button>
                </div>
              </>
            )}

            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', padding: '24px 0' }}>
                <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={28} />
                </span>
                <h2 className="disp" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>
                  Thank you, {personName.split(' ')[0] || 'there'}
                </h2>
                <p className="muted" style={{ margin: 0, maxWidth: 460 }}>
                  {mgrFirst} has your testimonial. You'll find it under Feedback, where you can change where it's used or take it down at any time.
                </p>
                <Link className="btn bp" to="/client/feedback">
                  Back to Feedback
                </Link>
              </div>
            )}
          </section>
        </div>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="glass up" style={sectionStyle}>
            <span className="eyebrow">YOU STAY IN CONTROL</span>
            {PROMISES.map((p) => (
              <div key={p} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'flex-start' }}>
                <Check size={16} style={{ color: 'var(--brand)', flex: 'none', marginTop: 2 }} />
                <span>{p}</span>
              </div>
            ))}
          </section>
          {mgr && (
            <section className="glass up" style={sectionStyle}>
              <span className="eyebrow">NEED A HAND?</span>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Rather talk it through? {mgr.firstName} can do a 10-minute call and write it up for you to approve.
              </p>
              <a
                className="btn bg"
                style={{ justifyContent: 'center' }}
                href={`mailto:${mgr.email}?subject=${encodeURIComponent('Testimonial — quick call')}`}
              >
                Book a quick call
              </a>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
