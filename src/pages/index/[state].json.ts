import type { APIRoute } from 'astro';
import { shops,indexFor } from '../../lib/catalog';
export function getStaticPaths() {
  return [...new Set(shops.map(shop => shop.state))].map(state => ({params:{state:state.toLowerCase()},props:{state}}));
}
export const GET: APIRoute = ({props}) => new Response(JSON.stringify(indexFor(props.state)),{headers:{'content-type':'application/json'}});
