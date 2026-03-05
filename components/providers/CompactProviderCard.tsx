import Link from "next/link";
import type { Provider } from "./ProviderCard";
import { getInitials } from "@/lib/provider-utils";
import { FallbackImage } from "./FallbackImage";

interface CompactProviderCardProps {
  provider: Provider;
}

export default function CompactProviderCard({ provider }: CompactProviderCardProps) {
  return (
    <Link
      href={`/provider/${provider.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Image */}
      <div className="relative h-40 bg-gray-100">
        {provider.image ? (
          <FallbackImage
            src={provider.image}
            alt={provider.name}
            fallback={
              <div className="w-full h-full bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-primary-300">
                  {getInitials(provider.name)}
                </span>
                <span className="text-xs font-medium text-primary-300 mt-1">{provider.primaryCategory}</span>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-50 via-gray-50 to-warm-50 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-primary-300">
              {getInitials(provider.name)}
            </span>
            <span className="text-xs font-medium text-primary-300 mt-1">{provider.primaryCategory}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-1.5">
        <p className="text-xs text-primary-600 font-medium uppercase tracking-wider">
          {provider.primaryCategory}
        </p>
        <h3 className="font-semibold text-gray-900 text-sm leading-tight group-hover:text-primary-700 transition-colors">
          {provider.name}
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {provider.address && (
            <span className="flex items-center gap-1 truncate">
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {provider.address.split(",").slice(1, 2).join("").trim() || provider.address}
            </span>
          )}
          {provider.rating && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <svg className="w-3 h-3 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="font-medium text-gray-700">{provider.rating}</span>
            </span>
          )}
        </div>
        {provider.priceRange && provider.priceRange !== "Contact for pricing" && (
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {provider.priceRange}
          </p>
        )}
      </div>
    </Link>
  );
}
