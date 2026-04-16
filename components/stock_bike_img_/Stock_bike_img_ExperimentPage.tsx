'use client';

import { useEffect, useMemo, useState } from 'react';

type Stock_bike_img_condition = {
  position: number;
  allowedValues: string[];
};

type Stock_bike_img_rule_row = {
  id: number;
  stock_bike_img_model_year: number;
  stock_bike_img_rule_category: string;
  stock_bike_img_rule_name: string;
  stock_bike_img_rule_description: string | null;
  stock_bike_img_conditions_json: Stock_bike_img_condition[];
  stock_bike_img_layer_order: number;
  stock_bike_img_picture_link_1: string | null;
  stock_bike_img_picture_link_2: string | null;
  stock_bike_img_picture_link_3: string | null;
  stock_bike_img_is_active: boolean;
};

type Stock_bike_img_draft = {
  stock_bike_img_model_year: number;
  stock_bike_img_rule_category: string;
  stock_bike_img_rule_name: string;
  stock_bike_img_rule_description: string;
  stock_bike_img_layer_order: number;
  stock_bike_img_conditions_text: string;
  stock_bike_img_picture_link_1: string;
  stock_bike_img_picture_link_2: string;
  stock_bike_img_picture_link_3: string;
  stock_bike_img_is_active: boolean;
};

const Stock_bike_img_default_draft: Stock_bike_img_draft = {
  stock_bike_img_model_year: 2026,
  stock_bike_img_rule_category: '',
  stock_bike_img_rule_name: '',
  stock_bike_img_rule_description: '',
  stock_bike_img_layer_order: 100,
  stock_bike_img_conditions_text: '1=S;4=B;17=B,C,D',
  stock_bike_img_picture_link_1: '',
  stock_bike_img_picture_link_2: '',
  stock_bike_img_picture_link_3: '',
  stock_bike_img_is_active: true,
};

const Stock_bike_img_parse_conditions_text = (value: string): Stock_bike_img_condition[] => {
  const segments = value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error('At least one condition is required. Use format: 1=S;17=B,C,D');
  }

  const conditions = segments.map((segment) => {
    const [rawPosition, rawValues] = segment.split('=');
    const position = Number((rawPosition ?? '').trim());
    if (!Number.isInteger(position) || position < 1 || position > 30) {
      throw new Error(`Invalid condition position: ${rawPosition}`);
    }

    const allowedValues = [...new Set(String(rawValues ?? '')
      .split(',')
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b));

    if (allowedValues.length === 0) {
      throw new Error(`Condition ${position} must contain at least one value.`);
    }

    return { position, allowedValues };
  });

  const seen = new Set<number>();
  for (const condition of conditions) {
    if (seen.has(condition.position)) {
      throw new Error(`Duplicate position ${condition.position} in conditions.`);
    }
    seen.add(condition.position);
  }

  return conditions.sort((a, b) => a.position - b.position);
};

const Stock_bike_img_conditions_to_text = (conditions: Stock_bike_img_condition[]) =>
  conditions.map((condition) => `${condition.position}=${condition.allowedValues.join(',')}`).join(';');

export default function Stock_bike_img_ExperimentPage() {
  const [stock_bike_img_rows, setStock_bike_img_rows] = useState<Stock_bike_img_rule_row[]>([]);
  const [stock_bike_img_model_year_filter, setStock_bike_img_model_year_filter] = useState<number>(2026);
  const [stock_bike_img_draft, setStock_bike_img_draft] = useState<Stock_bike_img_draft>(Stock_bike_img_default_draft);
  const [stock_bike_img_editing_rule_id, setStock_bike_img_editing_rule_id] = useState<number | null>(null);
  const [stock_bike_img_status, setStock_bike_img_status] = useState('');
  const [stock_bike_img_test_sku, setStock_bike_img_test_sku] = useState('');
  const [stock_bike_img_test_result, setStock_bike_img_test_result] = useState<any>(null);

  const Stock_bike_img_load_rules = async () => {
    const params = new URLSearchParams({ stock_bike_img_model_year: String(stock_bike_img_model_year_filter) });
    const response = await fetch(`/api/stock_bike_img_rules?${params.toString()}`);
    const payload = await response.json().catch(() => ({ rows: [] }));
    setStock_bike_img_rows(payload.rows ?? []);
  };

  useEffect(() => {
    void Stock_bike_img_load_rules();
  }, [stock_bike_img_model_year_filter]);

  const stock_bike_img_can_submit = useMemo(
    () =>
      stock_bike_img_draft.stock_bike_img_rule_category.trim().length > 0 &&
      stock_bike_img_draft.stock_bike_img_rule_name.trim().length > 0 &&
      stock_bike_img_draft.stock_bike_img_conditions_text.trim().length > 0,
    [stock_bike_img_draft],
  );

  const Stock_bike_img_reset_draft = () => {
    setStock_bike_img_editing_rule_id(null);
    setStock_bike_img_draft({ ...Stock_bike_img_default_draft, stock_bike_img_model_year: stock_bike_img_model_year_filter });
  };

  const Stock_bike_img_save_rule = async () => {
    if (!stock_bike_img_can_submit) {
      setStock_bike_img_status('Category, name and conditions are required.');
      return;
    }

    let stock_bike_img_conditions_json: Stock_bike_img_condition[];
    try {
      stock_bike_img_conditions_json = Stock_bike_img_parse_conditions_text(stock_bike_img_draft.stock_bike_img_conditions_text);
    } catch (error) {
      setStock_bike_img_status(error instanceof Error ? error.message : 'Invalid conditions format');
      return;
    }

    const method = stock_bike_img_editing_rule_id ? 'PUT' : 'POST';
    const url = stock_bike_img_editing_rule_id
      ? `/api/stock_bike_img_rules/${stock_bike_img_editing_rule_id}`
      : '/api/stock_bike_img_rules';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...stock_bike_img_draft,
        stock_bike_img_conditions_json,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStock_bike_img_status(payload.error ?? 'Save failed');
      return;
    }

    setStock_bike_img_status(stock_bike_img_editing_rule_id ? 'Rule updated.' : 'Rule created.');
    Stock_bike_img_reset_draft();
    await Stock_bike_img_load_rules();
  };

  const Stock_bike_img_delete_rule = async (id: number) => {
    if (!window.confirm('Delete this Stock_bike_img rule?')) return;
    const response = await fetch(`/api/stock_bike_img_rules/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setStock_bike_img_status('Failed to delete rule.');
      return;
    }
    setStock_bike_img_status('Rule deleted.');
    if (stock_bike_img_editing_rule_id === id) Stock_bike_img_reset_draft();
    await Stock_bike_img_load_rules();
  };

  const Stock_bike_img_test_runtime = async () => {
    const response = await fetch('/api/stock_bike_img_rules/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock_bike_img_sku_code: stock_bike_img_test_sku }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStock_bike_img_status(payload.error ?? 'Failed to test SKU');
      setStock_bike_img_test_result(null);
      return;
    }

    setStock_bike_img_status(`SKU evaluated for model year ${payload.stock_bike_img_model_year}.`);
    setStock_bike_img_test_result(payload);
  };

  return (
    <div className="pageRoot stockBikeImgPage">
      <header className="pageHeader">
        <h1>Stock_bike_img_ experiment</h1>
        <p>Isolated rule engine by SKU digit conditions. Existing CPQ picture-management remains untouched.</p>
      </header>

      <section className="card compactCard stockBikeImgControls">
        <label>
          Model year
          <select
            value={stock_bike_img_model_year_filter}
            onChange={(event) => {
              const year = Number(event.target.value);
              setStock_bike_img_model_year_filter(year);
              setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_model_year: year }));
            }}
          >
            {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label>
          Test 30-digit SKU
          <input
            value={stock_bike_img_test_sku}
            maxLength={30}
            onChange={(event) => setStock_bike_img_test_sku(event.target.value.toUpperCase())}
            placeholder="Paste SKU code"
          />
        </label>

        <button className="primary" type="button" onClick={Stock_bike_img_test_runtime}>
          Test Stock_bike_img_ runtime
        </button>
      </section>

      <section className="card compactCard stockBikeImgEditor">
        <h3>{stock_bike_img_editing_rule_id ? `Edit Stock_bike_img_ rule #${stock_bike_img_editing_rule_id}` : 'Create Stock_bike_img_ rule'}</h3>
        <div className="stockBikeImgFormGrid">
          <label>
            Rule category
            <input
              value={stock_bike_img_draft.stock_bike_img_rule_category}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_rule_category: event.target.value }))
              }
              placeholder="Main frame colour"
            />
          </label>
          <label>
            Rule name
            <input
              value={stock_bike_img_draft.stock_bike_img_rule_name}
              onChange={(event) => setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_rule_name: event.target.value }))}
              placeholder="Handlebar A"
            />
          </label>
          <label>
            Layer order
            <input
              type="number"
              min={1}
              max={999}
              value={stock_bike_img_draft.stock_bike_img_layer_order}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_layer_order: Number(event.target.value) || 100 }))
              }
            />
          </label>
          <label className="stockBikeImgWide">
            Conditions (format: 1=S;4=B;17=B,C,D)
            <input
              value={stock_bike_img_draft.stock_bike_img_conditions_text}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_conditions_text: event.target.value }))
              }
            />
          </label>
          <label className="stockBikeImgWide">
            Description
            <input
              value={stock_bike_img_draft.stock_bike_img_rule_description}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_rule_description: event.target.value }))
              }
              placeholder="Optional meaning/output"
            />
          </label>
          <label>
            Picture link 1
            <input
              value={stock_bike_img_draft.stock_bike_img_picture_link_1}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_picture_link_1: event.target.value }))
              }
            />
          </label>
          <label>
            Picture link 2
            <input
              value={stock_bike_img_draft.stock_bike_img_picture_link_2}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_picture_link_2: event.target.value }))
              }
            />
          </label>
          <label>
            Picture link 3
            <input
              value={stock_bike_img_draft.stock_bike_img_picture_link_3}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_picture_link_3: event.target.value }))
              }
            />
          </label>
          <label className="stockBikeImgToggle">
            <input
              type="checkbox"
              checked={stock_bike_img_draft.stock_bike_img_is_active}
              onChange={(event) =>
                setStock_bike_img_draft((prev) => ({ ...prev, stock_bike_img_is_active: event.target.checked }))
              }
            />
            Active
          </label>
        </div>
        <div className="rowButtons">
          <button className="primary" type="button" disabled={!stock_bike_img_can_submit} onClick={Stock_bike_img_save_rule}>
            {stock_bike_img_editing_rule_id ? 'Update rule' : 'Create rule'}
          </button>
          {stock_bike_img_editing_rule_id ? (
            <button type="button" onClick={Stock_bike_img_reset_draft}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </section>

      {stock_bike_img_status ? <div className="note">{stock_bike_img_status}</div> : null}

      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Category</th>
              <th>Name</th>
              <th>Conditions</th>
              <th>Layer</th>
              <th>Pictures</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stock_bike_img_rows.map((row) => (
              <tr key={row.id} className={row.stock_bike_img_is_active ? '' : 'inactiveRow'}>
                <td>{row.id}</td>
                <td>{row.stock_bike_img_rule_category}</td>
                <td>{row.stock_bike_img_rule_name}</td>
                <td className="codeCell">{Stock_bike_img_conditions_to_text(row.stock_bike_img_conditions_json)}</td>
                <td>{row.stock_bike_img_layer_order}</td>
                <td className="secondaryText">
                  {[row.stock_bike_img_picture_link_1, row.stock_bike_img_picture_link_2, row.stock_bike_img_picture_link_3]
                    .filter((entry) => (entry ?? '').trim().length > 0)
                    .length}
                </td>
                <td>
                  <div className="rowButtons">
                    <button
                      type="button"
                      onClick={() => {
                        setStock_bike_img_editing_rule_id(row.id);
                        setStock_bike_img_draft({
                          stock_bike_img_model_year: row.stock_bike_img_model_year,
                          stock_bike_img_rule_category: row.stock_bike_img_rule_category,
                          stock_bike_img_rule_name: row.stock_bike_img_rule_name,
                          stock_bike_img_rule_description: row.stock_bike_img_rule_description ?? '',
                          stock_bike_img_layer_order: row.stock_bike_img_layer_order,
                          stock_bike_img_conditions_text: Stock_bike_img_conditions_to_text(row.stock_bike_img_conditions_json),
                          stock_bike_img_picture_link_1: row.stock_bike_img_picture_link_1 ?? '',
                          stock_bike_img_picture_link_2: row.stock_bike_img_picture_link_2 ?? '',
                          stock_bike_img_picture_link_3: row.stock_bike_img_picture_link_3 ?? '',
                          stock_bike_img_is_active: row.stock_bike_img_is_active,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="dangerAction" onClick={() => Stock_bike_img_delete_rule(row.id)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {stock_bike_img_rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="subtle">
                  No rules found for selected model year.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {stock_bike_img_test_result ? (
        <section className="card compactCard stockBikeImgRuntime">
          <h3>Runtime result</h3>
          <div className="subtle">
            SKU: {stock_bike_img_test_result.stock_bike_img_sku_code} | Model year: {stock_bike_img_test_result.stock_bike_img_model_year}
          </div>
          <div>Matched rules: {stock_bike_img_test_result.stock_bike_img_matched_rules?.length ?? 0}</div>
          <ol>
            {(stock_bike_img_test_result.stock_bike_img_layered_images ?? []).map((layer: any, index: number) => (
              <li key={`${layer.stock_bike_img_rule_id}-${index}`}>
                Layer {layer.stock_bike_img_layer_order} / {layer.stock_bike_img_rule_category} / slot {layer.stock_bike_img_slot}:{' '}
                <a href={layer.stock_bike_img_picture_link} target="_blank" rel="noreferrer">
                  {layer.stock_bike_img_picture_link}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
