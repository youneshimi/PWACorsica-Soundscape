import { Bird, House, Leaf, MapPin, Music, ShoppingBasket, Waves } from 'lucide-react';

const icons = {
  mer: Waves,
  nature: Leaf,
  village: House,
  animal: Bird,
  musique: Music,
  marche: ShoppingBasket,
  autre: MapPin,
};

export default function CategoryIcon({ category, size = 20, ...props }) {
  const Icon = icons[category] || MapPin;
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" {...props} />;
}
