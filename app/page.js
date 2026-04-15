import AnnouncementBar from '@/components/AnnouncementBar';
import Hero from '@/components/Hero';
import Categories from '@/components/Categories';
import FeaturedBanner from '@/components/FeaturedBanner';
import ProductGrid from '@/components/ProductGrid';
import SplitBanners from '@/components/SplitBanners';

export default function Home() {
    return (
        <main>
            {/* 1. Barra ticker animada con mensajes de promoción */}
            <AnnouncementBar />

            {/* 2. Hero — pantalla completa con banner principal */}
            <Hero />

            {/* 3. Categorías — 4 cards en grid horizontal con imágenes */}
            <Categories />

            {/* 4. Banner featured — campaña de temporada */}
            <FeaturedBanner
                title="Colección Primavera 2026"
                subtitle="Los títulos más esperados ya están aquí"
                badge="NUEVO"
                ctaText="Ver colección"
                ctaHref="/novedades"
                imageSrc="/banners/featured-banner.webp"
            />

            {/* 5. Grid de productos — novedades */}
            <ProductGrid />

            {/* 6. Split banners — promoción + preventa lado a lado */}
            <SplitBanners />
        </main>
    );
}
