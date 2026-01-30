import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold text-white">Olera</span>
            </Link>
            <p className="text-gray-400 max-w-md">
              Helping families find the right senior care. Compare trusted
              providers in your area and connect with confidence.
            </p>
          </div>

          {/* For Families */}
          <div>
            <h3 className="text-white font-semibold mb-4">For Families</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/browse"
                  className="hover:text-white transition-colors"
                >
                  Browse Care Options
                </Link>
              </li>
              <li>
                <Link
                  href="/browse?type=assisted-living"
                  className="hover:text-white transition-colors"
                >
                  Assisted Living
                </Link>
              </li>
              <li>
                <Link
                  href="/browse?type=home-care"
                  className="hover:text-white transition-colors"
                >
                  Home Care
                </Link>
              </li>
              <li>
                <Link
                  href="/browse?type=memory-care"
                  className="hover:text-white transition-colors"
                >
                  Memory Care
                </Link>
              </li>
            </ul>
          </div>

          {/* For Providers */}
          <div>
            <h3 className="text-white font-semibold mb-4">For Providers</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/for-providers"
                  className="hover:text-white transition-colors"
                >
                  Why Olera?
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/signup?type=provider"
                  className="hover:text-white transition-colors"
                >
                  Claim Your Listing
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="hover:text-white transition-colors"
                >
                  Pricing
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} Olera. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link
              href="/privacy"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
