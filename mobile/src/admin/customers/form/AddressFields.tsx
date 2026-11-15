import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { errorMessage } from '../../../api/client';
import { T } from '../../../ui';
import { colors } from '../../../theme';
import { customerFormApi, type AddressSuggestion } from '../../../api/admin/customerForm';
import { countryByCode } from './countries';
import { subdivisionsOf } from './subdivisions';
import { CountryField, Field, Input, SmallBtn, StateField } from './fields';
import { toTitleCase, type AddressValues } from './model';

/**
 * Address block reused by the Principal and Billing addresses — a port of the
 * web AddressFields. The street line has live autocomplete (free Nominatim via
 * GET /geo/search, scoped to the selected country, debounced); picking a
 * suggestion fills the street, city, postcode and — when the match lands in
 * another country — the country. Every field stays editable.
 */
export function AddressFields({
  value,
  onChange,
  disabled,
}: {
  value: AddressValues;
  onChange: (patch: Partial<AddressValues>) => void;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped on every keystroke so a slow response for an old term is ignored.
  const reqId = useRef(0);

  useEffect(() => {
    if (disabled) return;
    const q = term.trim();
    if (q.length < 1) {
      reqId.current++;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await customerFormApi.searchAddresses(q, value.country || undefined);
        if (id !== reqId.current) return;
        setSuggestions(results);
        setOpen(true);
      } catch {
        // A failed lookup never blocks manual entry.
        if (id === reqId.current) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [term, value.country, disabled]);

  const choose = (s: AddressSuggestion) => {
    // Street only — the Flat/Apartment/Building line is typed by hand.
    const patch: Partial<AddressValues> = { line1: toTitleCase(s.line1 || s.label) };
    if (s.city) patch.city = toTitleCase(s.city);
    if (s.postcode) patch.postcode = s.postcode;
    if (countryByCode(s.countryCode)) patch.country = s.countryCode.toUpperCase();
    onChange(patch);
    reqId.current++;
    setTerm('');
    setSuggestions([]);
    setOpen(false);
    setLoading(false);
  };

  const setCountry = (code: string) => {
    // A state that doesn't belong to the new country is dropped.
    const keepState = !value.state || subdivisionsOf(code).some((x) => x.value === value.state);
    onChange({ country: code, ...(keepState ? {} : { state: '' }) });
  };

  /**
   * "Use my location": ask for permission, take a fix and reverse-geocode it
   * through the API (as the web does). Only resolved fields are written, and a
   * loose fix is called out because a wrong postcode looks as confident as a
   * right one.
   */
  const [locating, setLocating] = useState(false);
  const fillFromLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Location permission denied', 'Enter the address manually, or allow location access in Settings.');
        return;
      }
      let pos: Location.LocationObject;
      try {
        pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      } catch {
        Alert.alert('Could not get your location', 'Enter the address manually.');
        return;
      }
      const found = await customerFormApi.reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      const patch: Partial<AddressValues> = {};
      if (found.line1) patch.line1 = toTitleCase(found.line1);
      if (found.city) patch.city = toTitleCase(found.city);
      if (found.postcode) patch.postcode = found.postcode;
      if (countryByCode(found.countryCode)) {
        const code = found.countryCode.toUpperCase();
        patch.country = code;
        if (value.state && !subdivisionsOf(code).some((x) => x.value === value.state)) patch.state = '';
      }
      onChange(patch);
      const accuracy = Math.round(pos.coords.accuracy ?? 0);
      if (found.precision === 'approximate') {
        Alert.alert('Area only', 'Only the area could be identified — enter the street and postcode yourself.');
      } else if (accuracy > 500) {
        const dist = accuracy >= 1000 ? `${(accuracy / 1000).toFixed(1)} km` : `${accuracy} m`;
        Alert.alert('Check the postcode', `Your location is only accurate to about ${dist} — check the postcode.`);
      } else if (!found.line1) {
        Alert.alert('No street found', 'No street is mapped here — enter the street address yourself.');
      } else {
        Alert.alert('Address filled', 'Filled from your location — check and adjust as needed.');
      }
    } catch (e) {
      Alert.alert('Could not look up that location', errorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  return (
    <View>
      <SmallBtn
        title={locating ? 'Detecting…' : 'Use my location'}
        icon="locate-outline"
        onPress={() => void fillFromLocation()}
        loading={locating}
        disabled={disabled}
        style={{ alignSelf: 'flex-end', marginTop: 12 }}
      />
      <Field label="Flat/Apartment/Building Name">
        <Input
          placeholder="Optional"
          value={value.line2}
          onChangeText={(t) => onChange({ line2: toTitleCase(t) })}
          disabled={disabled}
        />
      </Field>
      <Field label="Address" hint="Type a few letters and pick the address to fill the fields below">
        <View>
          <Input
            placeholder="Start typing an address…"
            value={value.line1}
            onChangeText={(t) => {
              const v = toTitleCase(t);
              onChange({ line1: v });
              setTerm(v);
            }}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => {
              // Leaving the field abandons any lookup in flight.
              reqId.current++;
              setLoading(false);
            }}
            autoCorrect={false}
            disabled={disabled}
            style={{ paddingRight: 40 }}
          />
          {loading ? <ActivityIndicator size="small" color={colors.muted} style={{ position: 'absolute', right: 12, top: 16 }} /> : null}
        </View>
        {open && suggestions.length > 0 ? (
          <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden' }}>
            {suggestions.map((s, i) => (
              <Pressable
                key={`${s.label}-${i}`}
                onPress={() => choose(s)}
                style={({ pressed }) => [
                  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                  pressed && { backgroundColor: colors.soft },
                ]}
              >
                <Ionicons name="location-outline" size={16} color={colors.muted} style={{ marginTop: 1 }} />
                <T size={13.5} style={{ flex: 1, lineHeight: 19 }}>
                  {s.label}
                </T>
              </Pressable>
            ))}
            <Pressable onPress={() => setOpen(false)} style={{ paddingVertical: 9, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line }}>
              <T w="s" size={12.5} color={colors.muted}>
                Close suggestions
              </T>
            </Pressable>
          </View>
        ) : null}
      </Field>
      <Field label="Suburb">
        <Input value={value.suburb} onChangeText={(t) => onChange({ suburb: toTitleCase(t) })} disabled={disabled} />
      </Field>
      <Field label="City">
        <Input value={value.city} onChangeText={(t) => onChange({ city: toTitleCase(t) })} disabled={disabled} />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="State" style={{ flex: 1.4 }}>
          <StateField country={value.country} value={value.state} onChange={(v) => onChange({ state: v })} disabled={disabled} />
        </Field>
        <Field label="Postcode" style={{ flex: 1 }}>
          <Input
            value={value.postcode}
            onChangeText={(t) => onChange({ postcode: t })}
            maxLength={10}
            keyboardType={value.country === 'AU' ? 'number-pad' : 'default'}
            autoCapitalize="characters"
            disabled={disabled}
          />
        </Field>
      </View>
      <Field label="Country">
        <CountryField value={value.country} onChange={setCountry} disabled={disabled} />
      </Field>
    </View>
  );
}
