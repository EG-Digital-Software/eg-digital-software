import React from 'react';
import { View, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { API_URL } from '../../config';
import { colors } from '../../theme';
import { Btn, Card, Muted, Screen, T } from '../../ui';
import { Field } from '../billing/shared';

/** Embed code for the website testimonials widget. */
export default function WidgetScreen() {
  const endpoint = `${API_URL.replace(/\/$/, '')}/feedback/public/testimonials`;
  const snippet = `<div id="eg-testimonials"></div>
<script>
fetch('${endpoint}').then(r => r.json()).then(({ data }) => {
  const box = document.getElementById('eg-testimonials');
  box.innerHTML = data.map(t =>
    '<figure><blockquote></blockquote><figcaption></figcaption></figure>').join('');
  box.querySelectorAll('figure').forEach((f, i) => {
    f.querySelector('blockquote').textContent = '“' + data[i].quote + '”';
    f.querySelector('figcaption').textContent = data[i].personName + ', ' + data[i].companyName;
  });
});
</script>`;

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied');
  };

  return (
    <Screen title="Website widget" back>
      <Muted size={13} style={{ lineHeight: 19 }}>
        Paste this into elomagroup.org to show the testimonials marked “On website”. Only client-approved quotes the client allowed on the website
        are ever returned.
      </Muted>
      <Field label="Data link">
        <Card style={{ padding: 12, backgroundColor: colors.soft, borderColor: colors.soft }}>
          <T mono size={12} selectable>
            {endpoint}
          </T>
        </Card>
      </Field>
      <Field label="Embed code">
        <Card style={{ padding: 12, backgroundColor: colors.soft, borderColor: colors.soft }}>
          <T mono size={11} selectable style={{ lineHeight: 16 }}>
            {snippet}
          </T>
        </Card>
      </Field>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Btn title="Copy link" icon="link-outline" variant="ghost" onPress={() => void copy(endpoint)} style={{ flex: 1 }} />
        <Btn title="Copy code" icon="copy-outline" onPress={() => void copy(snippet)} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
