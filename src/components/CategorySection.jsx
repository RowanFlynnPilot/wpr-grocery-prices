import ItemCard from './ItemCard.jsx'

// A category band (e.g. "Meat & eggs") with its items in a responsive grid.
// Render order is driven by meta.categories, not by item order.
export default function CategorySection({ name, items, onOpen }) {
  if (!items.length) return null
  return (
    <section className="category" id={`cat-${slug(name)}`}>
      <h2 className="category__title">{name}</h2>
      <div className="grid">
        {items.map((item) => (
          <ItemCard key={item.key} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
