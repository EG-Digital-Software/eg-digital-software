import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useVerifyLoginOtp } from '@/hooks/useSession';
import { apiErrorMessage } from '@/api/client';
import { resendLoginOtpRequest, type LoginChallenge } from '@/api/auth';
import type { User } from '@/types';
import { SpotlightPill, SpotlightSubmit, SPOTLIGHT_INPUT, SPOTLIGHT_LINK } from '@/components/auth/SpotlightShell';

/** Second sign-in step: the 6-digit code emailed after a correct password. */
export function LoginOtpStep({
  challenge,
  onChallenge,
  onSignedIn,
  onBack,
}: {
  challenge: LoginChallenge;
  onChallenge: (c: LoginChallenge) => void;
  onSignedIn: (user: User) => void;
  onBack: () => void;
}) {
  const verify = useVerifyLoginOtp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [wait, setWait] = useState(challenge.resendInSeconds);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await verify(challenge.challengeId, code));
    } catch (err) {
      setError(apiErrorMessage(err, 'That code did not work'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const next = await resendLoginOtpRequest(challenge.challengeId);
      onChallenge(next);
      setWait(next.resendInSeconds);
      setCode('');
      toast.success(`A new code was sent to ${next.email}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send a new code'));
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      <p className="m-0 text-center text-sm text-[color:var(--eg-link)]">
        We emailed a 6-digit code to <span className="font-semibold text-[color:var(--eg-text)]">{challenge.email}</span>. It expires in{' '}
        {challenge.expiresInMinutes} minutes.
      </p>
      <SpotlightPill single>
        <label htmlFor="otp" className="sr-only">
          Sign-in code
        </label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className={`${SPOTLIGHT_INPUT} tracking-[0.4em]`}
        />
        <SpotlightSubmit loading={busy} disabled={code.length !== 6} label="Verify code" />
      </SpotlightPill>

      {error && <p className="m-0 text-center text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0 || resending}
          className={`${SPOTLIGHT_LINK} cursor-pointer border-0 bg-transparent p-0 font-[inherit] disabled:cursor-default disabled:opacity-60`}
        >
          {resending ? 'Sending…' : wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </button>
        <button type="button" onClick={onBack} className={`${SPOTLIGHT_LINK} cursor-pointer border-0 bg-transparent p-0 font-[inherit]`}>
          Use a different account
        </button>
      </div>
    </form>
  );
}
