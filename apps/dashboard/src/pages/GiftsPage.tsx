import { GIFTS, GIFT_TIERS } from '@zerocade/shared'

export function GiftsPage() {
  return (
    <div className="gifts-page">
      <h1>Gift catalog</h1>
      <p className="text-muted">A curated subset of the real TikTok gift catalog, grouped by rarity tier.</p>
      {GIFT_TIERS.map((tier) => (
        <section key={tier.id}>
          <h2 className="section-label">{tier.label}</h2>
          <div className="gift-grid">
            {GIFTS.filter((g) => g.tier === tier.id).map((g) => (
              <div key={g.id} className="gift-btn">
                <span className="gift-btn__emoji" aria-hidden="true">
                  {g.emoji}
                </span>
                <span className="gift-btn__name">{g.name}</span>
                <span className="gift-btn__coins">{g.coins.toLocaleString()} coins</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}