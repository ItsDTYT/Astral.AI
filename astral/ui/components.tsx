import React, { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export function IconButton({
    label,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
    return (
        <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
            {children}
        </button>
    );
}
export function Modal({
    title,
    children,
    close,
    wide = false,
}: {
    title: string;
    children: React.ReactNode;
    close: () => void;
    wide?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const label = useId();
    useEffect(() => {
        ref.current?.showModal();
        const dialog = ref.current;
        return () => dialog?.close();
    }, []);
    return (
        <dialog
            ref={ref}
            className={`modal ${wide ? 'wide' : ''}`}
            aria-labelledby={label}
            onCancel={(e) => {
                e.preventDefault();
                close();
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) close();
            }}
        >
            <div className="modal-title">
                <h2 id={label}>{title}</h2>
                <IconButton label="Close dialog" onClick={close}>
                    <X size={20} />
                </IconButton>
            </div>
            {children}
        </dialog>
    );
}

export function FileButton({ children, className = 'button secondary', ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'hidden' | 'children'> & { children: React.ReactNode }) {
    const input = useRef<HTMLInputElement>(null);
    return <span className="file-picker"><button type="button" className={className} disabled={props.disabled} onClick={() => input.current?.click()}>{children}</button><input {...props} ref={input} type="file" hidden /></span>;
}
