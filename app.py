import os
from functools import lru_cache

import pandas as pd
import plotly.express as px
import streamlit as st


DATA_FILE = os.path.join(os.path.dirname(__file__), "bev353od3530.csv")


@st.cache_data
def load_data(path=DATA_FILE):
    df = pd.read_csv(path, parse_dates=["StichtagDat"], dayfirst=True)
    # normalize column names
    df.columns = [c.strip() for c in df.columns]
    # ensure count is numeric
    df["AnzZuzuWir"] = pd.to_numeric(df["AnzZuzuWir"], errors="coerce").fillna(0).astype(int)
    df["year"] = df["EreignisDatJahr"].astype(int)
    df["month"] = df["EreignisDatMM"].astype(int)
    # canonical fields for filtering
    df["sex"] = df["SexLang"]
    df["age_group"] = df["AlterV20ueber80Kurz_noDM"].astype(str)
    df["origin"] = df["HerkunftLang"]
    df["quarter"] = df["QuarLang"]
    df["kreis"] = df["KreisLang"]
    # add a date for grouping (end of month is in StichtagDat already)
    df["date"] = pd.to_datetime(df["StichtagDat"], errors="coerce")
    return df


def main():
    st.set_page_config(page_title="Moving to Zurich — Data Explorer", layout="wide")
    st.title("Moving to Zurich — a playful data explorer")

    df = load_data()

    st.sidebar.header("Filters")
    years = sorted(df["year"].unique())
    year_min, year_max = int(min(years)), int(max(years))
    year_range = st.sidebar.slider("Year range", year_min, year_max, (year_min, year_max))

    sex_opts = list(df["sex"].unique())
    selected_sex = st.sidebar.multiselect("Sex", sex_opts, default=sex_opts)

    origin_opts = list(df["origin"].unique())
    selected_origins = st.sidebar.multiselect("Origin", origin_opts, default=origin_opts)

    age_opts = sorted(df["age_group"].unique())
    selected_ages = st.sidebar.multiselect("Age groups", age_opts, default=age_opts)

    # apply filters
    filtered = df[
        (df["year"] >= year_range[0])
        & (df["year"] <= year_range[1])
        & (df["sex"].isin(selected_sex))
        & (df["origin"].isin(selected_origins))
        & (df["age_group"].isin(selected_ages))
    ]

    st.sidebar.markdown(f"**Rows:** {len(filtered):,}")

    # Overview KPIs
    total = int(filtered["AnzZuzuWir"].sum())
    st.metric("Total recorded moves (filtered)", f"{total:,}")

    # Timeseries: monthly arrivals
    ts = (
        filtered.groupby(["date"]) ["AnzZuzuWir"].sum().reset_index().sort_values("date")
    )

    if ts.empty:
        st.warning("No data for this filter selection.")
        return

    col1, col2 = st.columns([2, 1])
    with col1:
        fig = px.line(ts, x="date", y="AnzZuzuWir", title="Monthly arrivals (count)")
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        # top quarters table
        top_quarters = (
            filtered.groupby("quarter")["AnzZuzuWir"].sum().reset_index().sort_values("AnzZuzuWir", ascending=False)
        )
        st.write("Top quarters")
        st.dataframe(top_quarters.head(10).style.format({"AnzZuzuWir": "{:,}"}), height=400)

    # Tabs for deeper exploration
    tab1, tab2, tab3 = st.tabs(["By Origin", "By Age & Sex", "Districts"])

    with tab1:
        grouped = (
            filtered.groupby(["year", "origin"])["AnzZuzuWir"].sum().reset_index()
        )
        fig2 = px.area(grouped, x="year", y="AnzZuzuWir", color="origin", title="Arrivals by origin over years")
        st.plotly_chart(fig2, use_container_width=True)

    with tab2:
        grouped2 = (
            filtered.groupby(["year", "age_group", "sex"])["AnzZuzuWir"].sum().reset_index()
        )
        fig3 = px.bar(grouped2, x="year", y="AnzZuzuWir", color="age_group", barmode="stack", facet_col="sex", title="Arrivals by age group and sex")
        st.plotly_chart(fig3, use_container_width=True)

    with tab3:
        kreis_top = (
            filtered.groupby(["kreis"])["AnzZuzuWir"].sum().reset_index().sort_values("AnzZuzuWir", ascending=False)
        )
        st.write("Top districts (Kreis)")
        st.dataframe(kreis_top.head(20).style.format({"AnzZuzuWir": "{:,}"}), height=400)


if __name__ == "__main__":
    main()
