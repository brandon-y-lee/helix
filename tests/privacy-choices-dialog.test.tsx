import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { privacyConsent, CONSENT_KEY } from "@/lib/privacy/consent";
import { PrivacyChoicesDialog } from "@/components/privacy/PrivacyChoicesDialog";

beforeEach(() => { window.localStorage.clear(); privacyConsent.load(); });

it("discards interrupted disclosure state and restores focus through repeated closes", async () => {
  const user = userEvent.setup();
  const cookies = vi.spyOn(document, "cookie", "set");
  const storage = vi.spyOn(Storage.prototype, "setItem");
  try {
    const { container } = render(<PrivacyChoicesDialog />);
    const trigger = screen.getByRole("button", {
      name: "Your Privacy Choices",
    });
    for (const method of ["outside", "close", "escape", "confirm"] as const) {
      await user.click(trigger);
      const dialog = screen.getByRole("dialog", {
        name: "Your Privacy Choices",
      });
      const essential = within(dialog).getByRole("button", {
        name: "Essential Cookies Always Active",
      });
      const analytics = within(dialog).getByRole("button", {
        name: "Analytics",
      });
      expect(essential).toHaveAttribute("aria-expanded", "true");
      expect(analytics).toHaveAttribute("aria-expanded", "false");
      expect(
        document.getElementById(analytics.getAttribute("aria-controls")!),
      ).not.toBeVisible();
      await user.click(analytics);
      expect(analytics).toHaveAttribute("aria-expanded", "true");
      expect(essential).toHaveAttribute("aria-expanded", "false");
      if (method === "outside") fireEvent.click(dialog.parentElement!);
      else if (method === "close")
        await user.click(
          within(dialog).getByRole("button", { name: "Close privacy choices" }),
        );
      else if (method === "escape") await user.keyboard("{Escape}");
      else
        await user.click(
          within(dialog).getByRole("button", { name: "Confirm my choices" }),
        );
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(container).not.toHaveAttribute("inert");
      expect(document.body).not.toHaveAttribute("data-sheet-scroll-lock");
    }
    expect(cookies).not.toHaveBeenCalled();
    expect(storage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!)).toMatchObject({analytics:false,marketing:false});
  } finally {
    cookies.mockRestore();
    storage.mockRestore();
  }
});

it("saves independent choices, discards edited drafts, and exposes the real wordmark", async()=>{
  const user=userEvent.setup(); render(<PrivacyChoicesDialog />);
  const trigger=screen.getByRole("button",{name:"Your Privacy Choices"});
  await user.click(trigger);
  let dialog=screen.getByRole("dialog");
  expect(within(dialog).getByRole("img",{name:"helix"})).toHaveAttribute("data-helix-identity","wordmark");
  await user.click(within(dialog).getByRole("switch",{name:"Allow analytics"}));
  await user.click(within(dialog).getByRole("button",{name:"Confirm my choices"}));
  await user.click(trigger); dialog=screen.getByRole("dialog");
  expect(within(dialog).getByRole("switch",{name:"Allow analytics"})).toBeChecked();
  expect(within(dialog).getByRole("switch",{name:"Allow marketing"})).not.toBeChecked();
  await user.click(within(dialog).getByRole("switch",{name:"Allow marketing"}));
  await user.keyboard("{Escape}"); await user.click(trigger);
  expect(screen.getByRole("switch",{name:"Allow marketing"})).not.toBeChecked();
});

it("honors GPC and reports failed persistence without claiming a successful save",async()=>{
  Object.defineProperty(navigator,"globalPrivacyControl",{configurable:true,value:true});
  const user=userEvent.setup();
  const {unmount}=render(<PrivacyChoicesDialog />);
  const storage=vi.spyOn(Storage.prototype,"setItem");
  try {
    await user.click(screen.getByRole("button",{name:"Your Privacy Choices"}));
    expect(screen.getByRole("switch",{name:"Allow marketing"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Accept All"}));
    expect(JSON.parse(window.localStorage.getItem(CONSENT_KEY)!)).toMatchObject({analytics:true,marketing:false});
    await user.click(screen.getByRole("button",{name:"Your Privacy Choices"}));
    storage.mockImplementation(()=>{throw new Error("blocked");});
    await user.click(screen.getByRole("button",{name:"Confirm my choices"}));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(privacyConsent.current()).toMatchObject({analytics:false,marketing:false});
  } finally {
    storage.mockRestore(); unmount();
    delete (navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl;
    privacyConsent.save({analytics:false,marketing:false});
  }
});
