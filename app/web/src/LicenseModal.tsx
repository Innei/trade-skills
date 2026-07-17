import { closeLicenseModal, useLicenseModalState } from "./licenseModalStore";
import { LicensePanel } from "./pages/settings/LicensePanel";
import { Modal } from "./ui";

export function LicenseModal() {
  const { open, trigger } = useLicenseModalState();
  if (!open) return null;

  return (
    <Modal title="订阅与授权" onClose={closeLicenseModal}>
      {trigger === "runtime-403" ? (
        <div className="license-modal-runtime-notice">本次操作因授权已失效被拒绝，请重新验证或激活。</div>
      ) : null}
      <LicensePanel />
    </Modal>
  );
}
