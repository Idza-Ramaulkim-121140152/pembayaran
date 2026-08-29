const ACTION_LABEL_KEYWORDS = ['aksi', 'action', 'tindakan', 'opsi'];

function normalizeLabel(label) {
    return String(label || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function markScrollableWrapper(table) {
    const wrapper = table.closest('.overflow-x-auto');
    if (wrapper) {
        wrapper.classList.add('mobile-table-wrapper');
    }
}

function isActionLabel(label) {
    const normalized = normalizeLabel(label);
    return ACTION_LABEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function resolveHeaderLabels(table) {
    const headCells = Array.from(table.querySelectorAll('thead tr:last-child th, thead tr:last-child td'));
    return headCells.map((cell) => cell.textContent?.trim() || '');
}

export function enhanceMobileTables(rootNode) {
    const root = rootNode || document;
    const tables = Array.from(root.querySelectorAll('.app-content table'));

    tables.forEach((table) => {
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        table.classList.add('mobile-table-auto');
        markScrollableWrapper(table);

        const labels = resolveHeaderLabels(table);
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));

        bodyRows.forEach((row) => {
            const cells = Array.from(row.children).filter((cell) => cell instanceof HTMLTableCellElement);
            const singleCell = cells.length === 1;

            cells.forEach((cell, index) => {
                const colSpan = Number(cell.getAttribute('colspan') || 1);
                const fallbackLabel = singleCell || colSpan > 1 ? '' : `Kolom ${index + 1}`;
                const label = labels[index] || fallbackLabel;

                cell.setAttribute('data-label', label);
                cell.classList.remove('mobile-action-cell', 'mobile-empty-row');

                if (singleCell || colSpan > 1) {
                    cell.classList.add('mobile-empty-row');
                    return;
                }

                if (isActionLabel(label)) {
                    cell.classList.add('mobile-action-cell');
                }
            });
        });
    });
}

let debounceTimer = null;

export function setupMobileTableObserver(rootNode) {
    const root = rootNode || document.body;
    enhanceMobileTables(root);

    const observer = new MutationObserver((mutations) => {
        let shouldEnhance = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        if (
                            node.tagName === 'TABLE' ||
                            node.tagName === 'TR' ||
                            (node.querySelector && node.querySelector('table'))
                        ) {
                            shouldEnhance = true;
                            break;
                        }
                    }
                }
            }
            if (shouldEnhance) {
                break;
            }
        }

        if (shouldEnhance) {
            if (debounceTimer) {
                cancelAnimationFrame(debounceTimer);
            }
            debounceTimer = requestAnimationFrame(() => {
                enhanceMobileTables(root);
            });
        }
    });

    observer.observe(root, {
        childList: true,
        subtree: true,
    });

    return () => {
        if (debounceTimer) {
            cancelAnimationFrame(debounceTimer);
        }
        observer.disconnect();
    };
}
