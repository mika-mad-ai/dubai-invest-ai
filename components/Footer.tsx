import React from 'react';
import { useI18n } from '../i18n';

const ARTICLE_HREFS = ['/analyse-geopolitique-dubai', '/guide-visa-or-dubai', '/meilleurs-quartiers-dubai-investissement', '/blog'];

const Footer: React.FC = () => {
  const { t } = useI18n();
  const articles = ARTICLE_HREFS.map((href, i) => ({ href, ...t.footer.articles[i] }));
  return (
  <footer
    style={{
      background: 'rgba(5,5,5,0.97)',
      borderTop: '1px solid rgba(212,175,55,0.12)',
      padding: '48px 24px 32px',
      marginTop: '80px',
    }}
  >
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, marginBottom: 48 }}>

        {/* Brand */}
        <div>
          <img src="/NewLogoDubAInvestV2.png" alt="DubaiInvest" style={{ height: 56, marginBottom: 16 }} />
          <p style={{ color: 'rgba(200,192,178,0.85)', fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
            {t.footer.brand}
          </p>
        </div>

        {/* Articles */}
        <div>
          <h3 style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            {t.footer.guides}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {articles.map(a => (
              <li key={a.href}>
                <a
                  href={a.href}
                  style={{ color: 'rgba(240,235,224,0.8)', textDecoration: 'none', fontSize: 13, lineHeight: 1.5 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(240,235,224,0.8)')}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>{a.title}</span>
                  <span style={{ color: 'rgba(200,192,178,0.75)', fontSize: 11 }}>{a.desc}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Simulateur */}
        <div>
          <h3 style={{ color: '#D4AF37', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
            {t.footer.simulator}
          </h3>
          <p style={{ color: 'rgba(200,192,178,0.85)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            {t.footer.simulatorDesc}
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.35)',
              color: '#D4AF37',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t.footer.simulatorCta}
          </a>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <p style={{ color: 'rgba(200,192,178,0.68)', fontSize: 11 }}>
          {t.footer.copyright}
        </p>
        <p style={{ color: 'rgba(200,192,178,0.62)', fontSize: 11 }}>
          {t.footer.disclaimer}
        </p>
      </div>
    </div>
  </footer>
  );
};

export default Footer;
