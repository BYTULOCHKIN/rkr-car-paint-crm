import { Badge } from '@/components/ui/badge';
import { stockTagColors, type StockTag } from '../constants/tags';

export function StockTagBadge({ tag }: { tag: StockTag }) {
  return (
    <Badge
      variant='secondary'
      className='rounded-sm border-0'
      style={stockTagColors[tag]}
      data-stock-tag={tag}
    >
      {tag}
    </Badge>
  );
}
