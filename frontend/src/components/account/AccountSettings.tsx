import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Camera, Trash2, Save, ShieldCheck, Check, X } from 'lucide-react';
import { useAuth } from '@/store/auth';
import {
  changePasswordRequest,
  updateProfileRequest,
  uploadAvatarRequest,
  removeAvatarRequest,
} from '@/api/auth';
import { apiErrorMessage } from '@/api/client';
import { titleCaseField } from '@/lib/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/misc';
import { Spinner } from '@/components/shared/states';
import { initials, mediaUrl, formatDate } from '@/lib/utils';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Admin',
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  EMPLOYEE: 'Employee',
};

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required').max(80),
  lastName: z.string().min(1, 'Required').max(80),
  email: z.string().email('Enter a valid email'),
});
type ProfileValues = z.infer<typeof profileSchema>;

const pwSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Must be different from your current password',
    path: ['newPassword'],
  });
type PwValues = z.infer<typeof pwSchema>;

/** Live checklist so the rule is visible before the form is submitted. */
function PasswordRules({ value }: { value: string }) {
  const rules = [
    { label: 'At least 8 characters', ok: value.length >= 8 },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(value) },
    { label: 'Contains a number', ok: /\d/.test(value) },
  ];
  if (!value) return null;
  return (
    <ul className="space-y-1 pt-0.5">
      {rules.map((r) => (
        <li
          key={r.label}
          className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-success' : 'text-muted-foreground'}`}
        >
          {r.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-sm font-medium">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

export function AccountSettings({ defaultTab = 'profile' }: { defaultTab?: 'profile' | 'password' }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const setToken = useAuth((s) => s.setToken);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPickAvatar = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > 3 * 1024 * 1024) return toast.error('Image must be under 3MB');
    setUploading(true);
    try {
      setUser(await uploadAvatarRequest(file));
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onRemoveAvatar = async () => {
    setUploading(true);
    try {
      setUser(await removeAvatarRequest());
      toast.success('Profile picture removed');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  // ── Profile details ──
  const profileForm = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });
  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    });
  }, [user, profileForm]);

  const onSaveProfile = async (values: ProfileValues) => {
    try {
      setUser(await updateProfileRequest(values));
      toast.success('Profile updated');
      profileForm.reset(values);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  // ── Password ──
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PwValues>({ resolver: zodResolver(pwSchema) });
  const newPassword = watch('newPassword') ?? '';

  const onChangePassword = async (values: PwValues) => {
    try {
      const result = await changePasswordRequest(values.currentPassword, values.newPassword);
      // The API rotated this device's tokens — adopt the new one so the session
      // survives instead of expiring quietly a few minutes later.
      setToken(result.accessToken);
      setUser(result.user);
      toast.success(
        result.sessionsRevoked > 0
          ? `Password updated — signed out of ${result.sessionsRevoked} other ${result.sessionsRevoked === 1 ? 'device' : 'devices'}`
          : 'Password updated'
      );
      reset();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="password">Change Password</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {user?.avatarUrl && <AvatarImage src={mediaUrl(user.avatarUrl)} alt="" />}
                  <AvatarFallback className="text-2xl">
                    {initials(user?.firstName, user?.lastName)}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 disabled:opacity-60"
                  aria-label="Change profile picture"
                >
                  {uploading ? (
                    <Spinner className="text-primary-foreground" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => onPickAvatar(e.target.files?.[0])}
                />
              </div>

              <div className="flex-1 text-center sm:text-left">
                <p className="text-lg font-semibold">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <Badge variant="default" className="mt-1.5">
                  {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="h-4 w-4" /> {user?.avatarUrl ? 'Change' : 'Upload'} photo
                </Button>
                {user?.avatarUrl && (
                  <Button variant="ghost" size="sm" onClick={onRemoveAvatar} disabled={uploading}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <p className="-mt-4 px-1 text-xs text-muted-foreground">
            PNG, JPG, WEBP or GIF — up to 3MB.
          </p>

          {/* Editing your own name and email was not possible before. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={profileForm.handleSubmit(onSaveProfile)}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <div className="space-y-1.5">
                  <Label>First name</Label>
                  <Input {...titleCaseField(profileForm.register('firstName'))} />
                  {profileForm.formState.errors.firstName && (
                    <p className="text-xs text-destructive">
                      {profileForm.formState.errors.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input {...titleCaseField(profileForm.register('lastName'))} />
                  {profileForm.formState.errors.lastName && (
                    <p className="text-xs text-destructive">
                      {profileForm.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Email</Label>
                  <Input type="email" {...profileForm.register('email')} />
                  {profileForm.formState.errors.email ? (
                    <p className="text-xs text-destructive">
                      {profileForm.formState.errors.email.message}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This is also your sign-in address.
                    </p>
                  )}
                </div>
                <div className="flex justify-end sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={
                      profileForm.formState.isSubmitting || !profileForm.formState.isDirty
                    }
                  >
                    {profileForm.formState.isSubmitting ? <Spinner /> : <Save className="h-4 w-4" />}{' '}
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail label="Role" value={ROLE_LABEL[user?.role ?? ''] ?? user?.role} />
              <Detail
                label="Status"
                value={
                  <Badge variant={user?.isActive === false ? 'muted' : 'success'}>
                    {user?.isActive === false ? 'Inactive' : 'Active'}
                  </Badge>
                }
              />
              <Detail label="Member since" value={user?.createdAt ? formatDate(user.createdAt) : null} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onChangePassword)} className="max-w-md space-y-4">
              <div className="space-y-1.5">
                <Label>Current password</Label>
                <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
                {errors.currentPassword && (
                  <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input type="password" autoComplete="new-password" {...register('newPassword')} />
                {errors.newPassword && (
                  <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                )}
                <PasswordRules value={newPassword} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm new password</Label>
                <Input type="password" autoComplete="new-password" {...register('confirm')} />
                {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Changing your password signs you out on every other device. This one stays signed in.
              </p>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner />} Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
