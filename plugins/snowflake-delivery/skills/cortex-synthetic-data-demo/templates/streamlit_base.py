"""
Base Streamlit Dashboard Template
This template provides a starting point for custom dashboard modifications.
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from snowflake.snowpark.context import get_active_session

# =============================================================================
# PAGE CONFIGURATION
# =============================================================================
st.set_page_config(
    page_title="Data Analytics Dashboard",
    page_icon="📊",
    layout="wide"
)

# =============================================================================
# DATA LOADING
# =============================================================================
@st.cache_resource
def get_session():
    """Get Snowflake session."""
    return get_active_session()

@st.cache_data(ttl=600)
def load_table(table_name: str) -> pd.DataFrame:
    """Load a table from Snowflake."""
    session = get_session()
    return session.table(table_name).to_pandas()

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def create_kpi_card(label: str, value: str, icon: str = "📊"):
    """Create a KPI metric card."""
    st.metric(label=f"{icon} {label}", value=value)

def create_pie_chart(data: pd.Series, title: str):
    """Create a pie chart."""
    fig = px.pie(values=data.values, names=data.index, hole=0.4, title=title)
    return fig

def create_bar_chart(data: pd.Series, title: str, x_label: str = "", y_label: str = "Count"):
    """Create a bar chart."""
    fig = px.bar(x=data.index, y=data.values, title=title)
    fig.update_layout(xaxis_title=x_label, yaxis_title=y_label)
    return fig

def create_line_chart(data: pd.Series, title: str, x_label: str = "Period", y_label: str = "Value"):
    """Create a line chart."""
    fig = px.line(x=data.index, y=data.values, title=title)
    fig.update_layout(xaxis_title=x_label, yaxis_title=y_label)
    return fig

# =============================================================================
# MAIN DASHBOARD
# =============================================================================
def main():
    # Header
    st.title("📊 Data Analytics Dashboard")
    st.markdown("---")
    
    # Sidebar filters
    st.sidebar.header("Filters")
    
    # Example date filter
    date_range = st.sidebar.date_input(
        "Select Date Range",
        value=[],
        help="Filter data by date"
    )
    
    # KPI Section
    st.subheader("Key Performance Indicators")
    kpi_cols = st.columns(4)
    
    with kpi_cols[0]:
        create_kpi_card("Total Records", "10,000", "📈")
    with kpi_cols[1]:
        create_kpi_card("Active Users", "1,234", "👥")
    with kpi_cols[2]:
        create_kpi_card("Revenue", "$125,000", "💰")
    with kpi_cols[3]:
        create_kpi_card("Growth Rate", "+15%", "🚀")
    
    st.markdown("---")
    
    # Charts Section
    st.subheader("Analytics")
    
    chart_cols = st.columns(2)
    
    with chart_cols[0]:
        # Example pie chart
        sample_data = pd.Series({"Category A": 40, "Category B": 30, "Category C": 20, "Category D": 10})
        fig = create_pie_chart(sample_data, "Distribution by Category")
        st.plotly_chart(fig, use_container_width=True)
    
    with chart_cols[1]:
        # Example bar chart
        sample_data = pd.Series({"Mon": 100, "Tue": 120, "Wed": 90, "Thu": 140, "Fri": 160})
        fig = create_bar_chart(sample_data, "Daily Activity")
        st.plotly_chart(fig, use_container_width=True)
    
    st.markdown("---")
    
    # Data Table Section
    st.subheader("Data Explorer")
    
    # Example: Load and display data
    # Uncomment and modify for your tables:
    # df = load_table("YOUR_DATABASE.YOUR_SCHEMA.YOUR_TABLE")
    # st.dataframe(df.head(100), use_container_width=True)
    
    st.info("Connect to your Snowflake tables to explore data.")
    
    # Footer
    st.markdown("---")
    st.caption("Dashboard powered by Snowflake & Streamlit")

if __name__ == "__main__":
    main()
