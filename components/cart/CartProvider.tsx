"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CART_QUERY_KEY,
  EMPTY_CART,
} from "@/lib/cart/client";
import {
  CART_IDENTITY_CHANGED_COOKIE,
  broadcastCartChanged,
  getCartChangeChannel,
  isCartChangeMessage,
  releaseCartChangeChannel,
} from "@/lib/cart/sync";

type CartDrawerContextValue = {
  cartDrawerOpen: boolean;
  openCartDrawer: (returnFocus?: () => void) => void;
  closeCartDrawer: () => void;
  returnFocusAfterCartDrawerClose: () => void;
};

const CartDrawerContext = createContext<CartDrawerContextValue | null>(null);
const CartRuntimeContext = createContext({
  commerceEnabled: true,
  identityVersion: 0,
});

function hasIdentityChangeSignal(): boolean {
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${CART_IDENTITY_CHANGED_COOKIE}=`));
}

function clearIdentityChangeSignal(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CART_IDENTITY_CHANGED_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
}

function CartSyncBoundary({
  disabled,
  onIdentityChanged,
}: {
  disabled: boolean;
  onIdentityChanged: () => void;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (disabled) return;
    const channel = getCartChangeChannel();
    if (!channel) return;
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isCartChangeMessage(event.data)) return;
      void queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      releaseCartChangeChannel(channel);
    };
  }, [disabled, queryClient]);

  useEffect(() => {
    if (disabled || !hasIdentityChangeSignal()) return;
    clearIdentityChangeSignal();
    void (async () => {
      await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
      queryClient.removeQueries({ queryKey: CART_QUERY_KEY });
      broadcastCartChanged();
      onIdentityChanged();
    })();
  }, [disabled, onIdentityChanged, pathname, queryClient]);

  return null;
}

function CartDrawerProvider({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled: boolean;
}) {
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const cartDrawerReturnFocusRef = useRef<() => void>(() => {});

  const openCartDrawer = useCallback((returnFocus?: () => void) => {
    if (disabled) return;
    cartDrawerReturnFocusRef.current = returnFocus ?? (() => {});
    setCartDrawerOpen(true);
  }, [disabled]);

  const closeCartDrawer = useCallback(() => {
    setCartDrawerOpen(false);
  }, []);

  const returnFocusAfterCartDrawerClose = useCallback(() => {
    cartDrawerReturnFocusRef.current();
    cartDrawerReturnFocusRef.current = () => {};
  }, []);

  const value = useMemo<CartDrawerContextValue>(() => ({
    cartDrawerOpen,
    openCartDrawer,
    closeCartDrawer,
    returnFocusAfterCartDrawerClose,
  }), [
    cartDrawerOpen,
    closeCartDrawer,
    openCartDrawer,
    returnFocusAfterCartDrawerClose,
  ]);

  return (
    <CartDrawerContext.Provider value={value}>
      {children}
    </CartDrawerContext.Provider>
  );
}

export function CartProvider({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const [identityVersion, setIdentityVersion] = useState(0);
  const handleIdentityChanged = useCallback(() => {
    setIdentityVersion((version) => version + 1);
  }, []);
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 0,
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          retry: false,
        },
      },
    });
    if (disabled) client.setQueryData(CART_QUERY_KEY, EMPTY_CART);
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <CartRuntimeContext.Provider
        value={{ commerceEnabled: !disabled, identityVersion }}
      >
        <CartDrawerProvider disabled={disabled}>
          <CartSyncBoundary
            disabled={disabled}
            onIdentityChanged={handleIdentityChanged}
          />
          {children}
        </CartDrawerProvider>
      </CartRuntimeContext.Provider>
    </QueryClientProvider>
  );
}

export function useCartDrawer(): CartDrawerContextValue {
  const context = useContext(CartDrawerContext);
  if (!context) {
    throw new Error("useCartDrawer must be used within a CartProvider");
  }
  return context;
}

export function useCartCommerceEnabled(): boolean {
  return useContext(CartRuntimeContext).commerceEnabled;
}
