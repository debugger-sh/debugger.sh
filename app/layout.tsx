import { AppToaster } from '@/components/AppToaster';

export const metadata = {
  title: 'debugger.sh',
  description: 'A barebones in-browser C/C++ IDE powered by debugger-sh',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: 'dark' }}>
      <body
        style={{
          margin: 0,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          background: '#0a0a0a',
          color: '#e5e5e5',
          // Dark track/thumb (Firefox); Blink uses ::-webkit-scrollbar in dock.css.
          scrollbarColor: '#525252 #0a0a0a',
        }}
      >
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
