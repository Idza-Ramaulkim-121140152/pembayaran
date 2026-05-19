import React from 'react';

function resolveValue(row, key) {
    if (!key) {
        return null;
    }

    return String(key)
        .split('.')
        .reduce((acc, current) => (acc == null ? undefined : acc[current]), row);
}

export function MobileRowCard({
    row,
    columns = [],
    actions = null,
    priorityFields = [],
}) {
    const priority = new Set(priorityFields);
    const visibleColumns = columns.filter((column) => !column.mobileHidden);
    const orderedColumns = [
        ...visibleColumns.filter((column) => priority.has(column.key)),
        ...visibleColumns.filter((column) => !priority.has(column.key)),
    ];

    return (
        <article className="mobile-section">
            <dl className="space-y-2">
                {orderedColumns.map((column) => {
                    const content = typeof column.renderMobile === 'function'
                        ? column.renderMobile(row)
                        : typeof column.render === 'function'
                            ? column.render(row)
                            : resolveValue(row, column.key) ?? '-';

                    return (
                        <div key={column.key || column.label} className="grid grid-cols-[minmax(90px,38%)_minmax(0,1fr)] gap-2">
                            <dt className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{column.label}</dt>
                            <dd className="text-sm text-slate-800 break-words">{content}</dd>
                        </div>
                    );
                })}
            </dl>

            {typeof actions === 'function' ? (
                <div className="mobile-action-bar">
                    {actions(row)}
                </div>
            ) : null}
        </article>
    );
}

export default MobileRowCard;
