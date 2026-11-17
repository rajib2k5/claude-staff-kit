#!/usr/bin/env python3
"""
generate_streamlit.py - Generate Streamlit dashboard code tailored to the dataset.

Usage:
    uv run --project <SKILL_DIR> python <SKILL_DIR>/scripts/generate_streamlit.py \
        --config ./synthetic_data_config.json \
        --output-dir ./output
"""

import argparse
import json
from pathlib import Path

DASHBOARD_TEMPLATES = {
    "financial_fraud": {
        "title": "Financial Fraud Detection Dashboard",
        "kpis": [
            ("Total Transactions", "len(transactions_df)", "📊"),
            ("Fraud Rate", "f\"{(fraud_df['IS_FRAUD'].sum() / len(fraud_df) * 100):.2f}%\"", "🚨"),
            ("Total Amount", "f\"${transactions_df['AMOUNT'].sum():,.2f}\"", "💰"),
            ("Flagged Transactions", "fraud_df['IS_FRAUD'].sum()", "⚠️"),
        ],
        "charts": [
            ("fraud_by_type", "bar", "Fraud by Type", "fraud_df[fraud_df['IS_FRAUD']==True].groupby('FRAUD_TYPE').size()"),
            ("amount_distribution", "histogram", "Transaction Amount Distribution", "transactions_df['AMOUNT']"),
            ("transactions_by_channel", "pie", "Transactions by Channel", "transactions_df['CHANNEL'].value_counts()"),
            ("fraud_over_time", "line", "Fraud Incidents Over Time", "fraud_df[fraud_df['IS_FRAUD']==True].groupby(pd.to_datetime(fraud_df['FLAGGED_DATE']).dt.strftime('%Y-%m')).size()"),
        ],
        "filters": ["transaction_type", "channel", "date_range"],
        "tables": ["transactions", "customers", "merchants", "fraud_labels"],
    },
    "logistics": {
        "title": "Logistics & Shipping Dashboard",
        "kpis": [
            ("Total Shipments", "len(shipments_df)", "📦"),
            ("On-Time Delivery Rate", "f\"{(deliveries_df['DELIVERY_STATUS']=='delivered').sum() / len(deliveries_df) * 100:.1f}%\"", "✅"),
            ("Avg Transit Days", "f\"{routes_df['ESTIMATED_DAYS'].mean():.1f} days\"", "🕐"),
            ("Total Shipping Revenue", "f\"${shipments_df['SHIPPING_COST'].sum():,.2f}\"", "💵"),
        ],
        "charts": [
            ("deliveries_by_status", "pie", "Deliveries by Status", "deliveries_df['DELIVERY_STATUS'].value_counts()"),
            ("shipments_by_priority", "bar", "Shipments by Priority", "shipments_df['PRIORITY'].value_counts()"),
            ("weight_distribution", "histogram", "Package Weight Distribution", "shipments_df['WEIGHT_LBS']"),
            ("shipments_over_time", "line", "Shipments Over Time", "shipments_df.groupby(pd.to_datetime(shipments_df['SHIP_DATE']).dt.strftime('%Y-%m')).size()"),
        ],
        "filters": ["priority", "transport_mode", "date_range"],
        "tables": ["shipments", "deliveries", "routes", "warehouses"],
    },
    "healthcare": {
        "title": "Healthcare Analytics Dashboard",
        "kpis": [
            ("Total Patients", "len(patients_df)", "👥"),
            ("Total Visits", "len(visits_df)", "🏥"),
            ("Avg Visit Duration", "f\"{visits_df['VISIT_DURATION_MIN'].mean():.0f} min\"", "⏱️"),
            ("Prescriptions Issued", "len(prescriptions_df)", "💊"),
        ],
        "charts": [
            ("visits_by_type", "pie", "Visits by Type", "visits_df['VISIT_TYPE'].value_counts()"),
            ("visits_by_department", "bar", "Visits by Department", "visits_df['DEPARTMENT'].value_counts()"),
            ("diagnoses_by_severity", "bar", "Diagnoses by Severity", "diagnoses_df['SEVERITY'].value_counts()"),
            ("visits_over_time", "line", "Visits Over Time", "visits_df.groupby(pd.to_datetime(visits_df['VISIT_DATE']).dt.strftime('%Y-%m')).size()"),
        ],
        "filters": ["visit_type", "department", "date_range"],
        "tables": ["patients", "visits", "diagnoses", "prescriptions"],
    },
    "ecommerce": {
        "title": "E-commerce Analytics Dashboard",
        "kpis": [
            ("Total Revenue", "f\"${orders_df['TOTAL_AMOUNT'].sum():,.2f}\"", "💰"),
            ("Total Orders", "len(orders_df)", "🛒"),
            ("Avg Order Value", "f\"${orders_df['TOTAL_AMOUNT'].mean():,.2f}\"", "📈"),
            ("Total Customers", "len(customers_df)", "👥"),
        ],
        "charts": [
            ("orders_by_status", "pie", "Orders by Status", "orders_df['STATUS'].value_counts()"),
            ("revenue_by_category", "bar", "Revenue by Product Category", "order_items_df.merge(products_df, on='PRODUCT_ID').groupby('CATEGORY')['LINE_TOTAL'].sum()"),
            ("orders_over_time", "line", "Orders Over Time", "orders_df.groupby(pd.to_datetime(orders_df['ORDER_DATE']).dt.strftime('%Y-%m')).size()"),
            ("payment_methods", "bar", "Payment Methods", "orders_df['PAYMENT_METHOD'].value_counts()"),
        ],
        "filters": ["status", "payment_method", "date_range"],
        "tables": ["orders", "customers", "products", "order_items"],
    },
}


def generate_streamlit_app(dataset_type: str, config: dict, output_dir: Path):
    """Generate the main Streamlit application file."""
    
    template = DASHBOARD_TEMPLATES.get(dataset_type, DASHBOARD_TEMPLATES["ecommerce"])
    # Check both nested and top-level config for database/schema
    sf_config = config.get("snowflake", {})
    database = sf_config.get("database") or config.get("database", "DEMO_DB")
    schema = sf_config.get("schema") or config.get("schema", "PUBLIC")
    
    # Build the app code
    app_code = f'''"""
{template["title"]}
Auto-generated Streamlit dashboard for synthetic data visualization.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from snowflake.snowpark.context import get_active_session

# Page configuration
st.set_page_config(
    page_title="{template["title"]}",
    page_icon="📊",
    layout="wide"
)

# Get Snowflake session
@st.cache_resource
def get_session():
    return get_active_session()

session = get_session()

# Load data from Snowflake
@st.cache_data(ttl=600)
def load_data():
    """Load all tables from Snowflake."""
    data = {{}}
'''
    
    # Add table loading
    for table in template["tables"]:
        app_code += f'''    data["{table}"] = session.table("{database}.{schema}.{table.upper()}").to_pandas()
'''
    
    app_code += '''    return data

data = load_data()

# Convert Decimal types to float for Plotly compatibility
# Snowflake NUMBER types become Python Decimal which Plotly cannot render properly
for table_name, df in data.items():
    for col in df.select_dtypes(include=['object']).columns:
        try:
            df[col] = pd.to_numeric(df[col], errors='ignore')
        except:
            pass
    for col in df.columns:
        if df[col].dtype == 'object':
            try:
                # Check if it's a Decimal type
                if hasattr(df[col].iloc[0], 'as_tuple'):
                    df[col] = df[col].astype(float)
            except:
                pass
'''
    
    # Assign dataframes
    for table in template["tables"]:
        app_code += f'''{table}_df = data["{table}"]
'''
    
    app_code += f'''

# Dashboard Title
st.title("{template["title"]}")
st.markdown("---")

# KPI Row
st.subheader("Key Performance Indicators")
kpi_cols = st.columns({len(template["kpis"])})

'''
    
    # Add KPIs
    for i, (name, formula, icon) in enumerate(template["kpis"]):
        app_code += f'''with kpi_cols[{i}]:
    st.metric(
        label="{icon} {name}",
        value={formula}
    )

'''
    
    app_code += '''st.markdown("---")

# Filters Sidebar
st.sidebar.header("Filters")
'''
    
    # Add date filter
    app_code += '''
# Date range filter (if applicable)
date_col = st.sidebar.date_input(
    "Date Range",
    value=[],
    help="Filter data by date range"
)

st.markdown("---")

# Charts Section
st.subheader("Analytics")

'''
    
    # Add charts in 2-column layout
    charts = template["charts"]
    for i in range(0, len(charts), 2):
        app_code += f'''chart_cols_{i//2} = st.columns(2)

'''
        for j, chart_idx in enumerate([i, i+1]):
            if chart_idx < len(charts):
                chart_name, chart_type, chart_title, chart_data = charts[chart_idx]
                
                app_code += f'''with chart_cols_{i//2}[{j}]:
    st.markdown("**{chart_title}**")
    try:
        chart_data_{chart_name} = {chart_data}
'''
                
                if chart_type == "pie":
                    app_code += f'''        fig = px.pie(
            values=chart_data_{chart_name}.values,
            names=chart_data_{chart_name}.index,
            hole=0.4
        )
        st.plotly_chart(fig, use_container_width=True)
'''
                elif chart_type == "bar":
                    app_code += f'''        fig = px.bar(
            x=chart_data_{chart_name}.index,
            y=chart_data_{chart_name}.values
        )
        fig.update_layout(xaxis_title="", yaxis_title="Count")
        st.plotly_chart(fig, use_container_width=True)
'''
                elif chart_type == "histogram":
                    # Use manual binning with bar chart - px.histogram doesn't work well with Snowflake Decimal types
                    col_match = chart_data.split("['")[-1].split("']")[0] if "['" in chart_data else "value"
                    df_name = chart_data.split("[")[0]
                    app_code += f'''        # Convert to float and bin manually for Plotly compatibility
        col_data = {df_name}['{col_match}'].astype(float)
        min_val, max_val = col_data.min(), col_data.max()
        bin_edges = [min_val + i * (max_val - min_val) / 5 for i in range(6)]
        bin_labels = [f"{{bin_edges[i]:.0f}}-{{bin_edges[i+1]:.0f}}" for i in range(5)]
        binned = pd.cut(col_data, bins=bin_edges, labels=bin_labels, include_lowest=True)
        bin_counts = binned.value_counts().sort_index()
        fig = px.bar(x=bin_counts.index.astype(str), y=bin_counts.values)
        fig.update_layout(xaxis_title="{col_match}", yaxis_title="Frequency")
        st.plotly_chart(fig, use_container_width=True)
'''
                elif chart_type == "line":
                    app_code += f'''        monthly_df = chart_data_{chart_name}.reset_index(name='count')
        monthly_df.columns = ['period', 'count']
        monthly_df = monthly_df.sort_values('period')
        fig = px.line(monthly_df, x='period', y='count', markers=True)
        fig.update_layout(xaxis_title="Period", yaxis_title="Count")
        st.plotly_chart(fig, use_container_width=True)
'''
                
                app_code += f'''    except Exception as e:
        st.error(f"Error loading chart: {{e}}")

'''
    
    # Add data exploration section
    app_code += '''st.markdown("---")

# Data Exploration
st.subheader("Data Exploration")

table_selection = st.selectbox(
    "Select a table to explore",
    options=list(data.keys())
)

if table_selection:
    st.dataframe(
        data[table_selection].head(100),
        use_container_width=True
    )
    st.caption(f"Showing first 100 rows of {len(data[table_selection])} total rows")

# Footer
st.markdown("---")
st.caption("Dashboard powered by Snowflake & Streamlit")
'''
    
    return app_code


def generate_snowflake_yml(dataset_type: str, config: dict, output_dir: Path):
    """Generate snowflake.yml deployment manifest."""
    
    # Check both nested and top-level config for database/schema
    sf_config = config.get("snowflake", {})
    database = sf_config.get("database") or config.get("database", "DEMO_DB")
    schema = sf_config.get("schema") or config.get("schema", "PUBLIC")
    warehouse = sf_config.get("warehouse") or config.get("warehouse", "COMPUTE_WH")
    
    template = DASHBOARD_TEMPLATES.get(dataset_type, DASHBOARD_TEMPLATES["ecommerce"])
    app_name = template["title"].upper().replace(" ", "_").replace("-", "_").replace("&", "AND")
    
    yml_content = f'''definition_version: 2
entities:
  {app_name.lower()}:
    type: streamlit
    identifier:
      name: {app_name}
      database: {database}
      schema: {schema}
    query_warehouse: {warehouse}
    main_file: streamlit_app.py
    artifacts:
      - streamlit_app.py
      - environment.yml
'''
    
    return yml_content


def generate_pyproject_toml():
    """Generate pyproject.toml for the Streamlit app."""
    
    return '''[project]
name = "synthetic-data-dashboard"
version = "0.1.0"
description = "Synthetic Data Analytics Dashboard"
requires-python = ">=3.11"
dependencies = [
    "streamlit>=1.30.0",
    "pandas>=2.0.0",
    "plotly>=5.18.0",
    "snowflake-snowpark-python>=1.40.0",
]
'''


def generate_environment_yml():
    """Generate environment.yml for Snowflake Streamlit dependencies."""
    
    return '''name: streamlit
channels:
  - snowflake
dependencies:
  - plotly
  - pandas
'''


def generate_load_data_sql(dataset_type: str, config: dict, output_dir: Path):
    """Generate SQL to load CSV data into Snowflake."""
    
    # Check both nested and top-level config for database/schema
    sf_config = config.get("snowflake", {})
    database = sf_config.get("database") or config.get("database", "DEMO_DB")
    schema = sf_config.get("schema") or config.get("schema", "PUBLIC")
    
    template = DASHBOARD_TEMPLATES.get(dataset_type, DASHBOARD_TEMPLATES["ecommerce"])
    
    sql_lines = [
        f"-- Load synthetic data into Snowflake",
        f"-- Database: {database}, Schema: {schema}",
        "",
        f"USE DATABASE {database};",
        f"USE SCHEMA {schema};",
        "",
        "-- Create file format for CSV",
        "CREATE OR REPLACE FILE FORMAT csv_format",
        "    TYPE = 'CSV'",
        "    FIELD_OPTIONALLY_ENCLOSED_BY = '\"'",
        "    SKIP_HEADER = 1",
        "    NULL_IF = ('', 'NULL');",
        "",
        "-- Create stage for data loading",
        f"CREATE OR REPLACE STAGE synthetic_data_stage",
        "    FILE_FORMAT = csv_format;",
        "",
    ]
    
    for table in template["tables"]:
        sql_lines.extend([
            f"-- Load {table}",
            f"-- PUT file://<PATH_TO_DATA>/{table}.csv @synthetic_data_stage/{table}/;",
            f"-- CREATE OR REPLACE TABLE {table.upper()} AS SELECT * FROM @synthetic_data_stage/{table}/ (FILE_FORMAT => csv_format);",
            "",
        ])
    
    return "\n".join(sql_lines)


def main():
    parser = argparse.ArgumentParser(description="Generate Streamlit dashboard code")
    parser.add_argument("--config", required=True, help="Path to config JSON file")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    args = parser.parse_args()
    
    # Load config
    with open(args.config, 'r') as f:
        config = json.load(f)
    
    dataset_type = config.get('dataset_type', 'ecommerce')
    if dataset_type == 'custom':
        dataset_type = 'ecommerce'
    
    output_dir = Path(args.output_dir)
    streamlit_dir = output_dir / "streamlit_app"
    streamlit_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating Streamlit dashboard for {dataset_type} dataset...")
    print("")
    
    # Generate files
    app_code = generate_streamlit_app(dataset_type, config, output_dir)
    yml_content = generate_snowflake_yml(dataset_type, config, output_dir)
    pyproject_content = generate_pyproject_toml()
    environment_content = generate_environment_yml()
    sql_content = generate_load_data_sql(dataset_type, config, output_dir)
    
    # Write files
    with open(streamlit_dir / "streamlit_app.py", 'w') as f:
        f.write(app_code)
    print(f"  Written: streamlit_app.py")
    
    with open(streamlit_dir / "snowflake.yml", 'w') as f:
        f.write(yml_content)
    print(f"  Written: snowflake.yml")
    
    with open(streamlit_dir / "environment.yml", 'w') as f:
        f.write(environment_content)
    print(f"  Written: environment.yml")
    
    with open(streamlit_dir / "pyproject.toml", 'w') as f:
        f.write(pyproject_content)
    print(f"  Written: pyproject.toml")
    
    with open(output_dir / "load_data.sql", 'w') as f:
        f.write(sql_content)
    print(f"  Written: load_data.sql")
    
    print("")
    print("Streamlit app generated successfully!")
    print(f"  Location: {streamlit_dir}")
    print("")
    print("Next steps:")
    print("  1. Load CSV data into Snowflake using load_data.sql")
    print("  2. Deploy the app: cd streamlit_app && snow streamlit deploy --replace")


if __name__ == "__main__":
    main()
