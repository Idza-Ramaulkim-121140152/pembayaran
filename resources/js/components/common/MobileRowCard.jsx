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
    onCardClick = null,
    priorityFields = [],
    cardClassName = '',
    labelClassName = '',
    valueClassName = '',
    actionBarClassName = '',
}) {
    const priority = new Set(priorityFields);
    const visibleColumns = columns.filter((column) => !column.mobileHidden);
    const orderedColumns = [
        ...visibleColumns.filter((column) => priority.has(column.key)),
        ...visibleColumns.filter((column) => !priority.has(column.key)),
    ];
    const resolvedLabelClassName = labelClassName || 'text-slate-500';
    const resolvedValueClassName = valueClassName || 'text-slate-800';

    return (
        <article
            onClick={(e) => {
                if (typeof onCardClick === 'function' && !e.target.closest('button, a, input, select, textarea')) {
                    onCardClick(row);
                }
            }}
            className={`mobile-section ${cardClassName} ${onCardClick ? 'cursor-pointer' : ''}`}
        >
            <dl className="space-y-2">
                {orderedColumns.map((column) => {
                    const content = typeof column.renderMobile === 'function'
                        ? column.renderMobile(row)
                        : typeof column.render === 'function'
                            ? column.render(row)
                            : resolveValue(row, column.key) ?? '-';

                    return (
                        <div key={column.key || column.label} className="grid grid-cols-[minmax(90px,38%)_minmax(0,1fr)] gap-2">
                            <dt className={`text-[11px] font-semibold uppercase tracking-wide ${resolvedLabelClassName}`}>{column.label}</dt>
                            <dd className={`break-words text-sm ${resolvedValueClassName}`}>{content}</dd>
                        </div>
                    );
                })}
            </dl>

            {typeof actions === 'function' ? (
                <div className={`mobile-action-bar ${actionBarClassName}`}>
                    {actions(row)}
                </div>
            ) : null}
        </article>
    );
}

export default MobileRowCard;
