import { StyleSheet, Text, TextProps } from 'react-native';

export function Title(props: TextProps) {
  return <Text {...props} style={[styles.title, props.style]} />;
}

export function Subtitle(props: TextProps) {
  return <Text {...props} style={[styles.sub, props.style]} />;
}

export function Body(props: TextProps) {
  return <Text {...props} style={[styles.body, props.style]} />;
}

export function Caption(props: TextProps) {
  return <Text {...props} style={[styles.cap, props.style]} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: '#f2f5f9', letterSpacing: 0.3 },
  sub: { fontSize: 15, color: '#9aa7b8', marginTop: 6 },
  body: { fontSize: 15, color: '#dce4ee', lineHeight: 22 },
  cap: { fontSize: 12, color: '#7d8a99' },
});
