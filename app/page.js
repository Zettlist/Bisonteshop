import Hero from '@/components/Hero';
import ProductGrid from '@/components/ProductGrid';
import Categories from '@/components/Categories';

export default function Home() {
    return (
        <main>
            <Hero />
            <Categories />
            <ProductGrid />
        </main>
    );
}
