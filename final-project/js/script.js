const width = 960;
const height = 600;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .attr("viewBox", [0, 0, width, height])
  .style("max-width", "100%")
  .style("height", "auto");

const projection = d3.geoAlbersUsa();
const path = d3.geoPath().projection(projection);

// Create bottom heatmap container
const heatmapSvg = d3.select("#heatmap")
  .append("svg")
  .attr("width", 800)
  .attr("height", 400)
  .style("display", "block")
  .style("margin", "40px auto");

const heatColorScale = d3.scaleSequential(d3.interpolateReds).domain([0, 1000]);

Promise.all([
  d3.json("data/us-states-d3.json"),
  d3.csv("data/us_contiguous_wildfires_strat50.csv", d => ({
    year: +d.FIRE_YEAR,
    state: d.STATE,
    lon: +d.LONGITUDE,
    lat: +d.LATITUDE,
    size: +d.FIRE_SIZE,
    cause: d.STAT_CAUSE_DESCR
  }))
]).then(([usTopo, fires]) => {
  const statesFC = topojson.feature(usTopo, usTopo.objects.states);
  const continentalUSFeatures = statesFC.features.filter(f => f.id);

  if (continentalUSFeatures.length > 0) {
    const continentalUS_FC = { type: "FeatureCollection", features: continentalUSFeatures };
    projection.fitSize([width, height], continentalUS_FC);
  } else {
    console.error("Error: No features to display.");
    return;
  }

  svg.append("g")
    .selectAll("path")
    .data(statesFC.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#f0f0f0")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5);

  const fireGroup = svg.append("g").attr("class", "fire-layer");

  const years = Array.from(new Set(fires.map(d => d.year))).sort((a, b) => a - b);
  const yearSlider = d3.select("#year-slider")
    .attr("min", d3.min(years))
    .attr("max", d3.max(years))
    .attr("value", d3.min(years));

  d3.select("#year-label").text(d3.min(years));

  function renderFires(filteredFires) {
    fireGroup.selectAll("circle").remove();

    fireGroup.selectAll("circle")
      .data(filteredFires)
      .enter()
      .append("circle")
      .attr("cx", d => projection([d.lon, d.lat])[0])
      .attr("cy", d => projection([d.lon, d.lat])[1])
      .attr("r", d => Math.log(d.size / 2 + 1))
      .attr("fill", d => {
        if (d.size < 100) return "green";
        else if (d.size < 750) return "yellow";
        else if (d.size < 50000) return "red";
        else return "black";
      })
      .attr("fill-opacity", 0.4)
      .on("mouseover", function (event, d) {
        d3.select("#tooltip")
          .style("opacity", 1)
          .html(`
            <strong>Year:</strong> ${d.year}<br>
            <strong>Size:</strong> ${d.size.toLocaleString()} acres<br>
            <strong>Cause:</strong> ${d.cause}<br>
            <strong>State:</strong> ${d.state}
          `);
      })
      .on("mousemove", function (event) {
        d3.select("#tooltip")
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function () {
        d3.select("#tooltip").style("opacity", 0);
      });
      
  }

  const causeSvg = d3.select("#cause-bar-chart");
  const chartMargin = { top: 30, right: 30, bottom: 100, left: 60 };
  const chartWidth = +causeSvg.attr("width") - chartMargin.left - chartMargin.right;function renderHeatmapGrid(cause, year) {
  const data = fires.filter(d => d.year === year && d.cause === cause);

  const stateCounts = d3.rollup(data, v => v.length, d => d.state);
  const states = Array.from(stateCounts.keys()).sort();
  const counts = Array.from(stateCounts.values());
  const maxCount = d3.max(counts) || 1;
  heatColorScale.domain([0, maxCount]);

  const cols = 10;
  const cellSize = 50;
  const legendWidth = 100;

  heatmapSvg.selectAll("*").remove();

  // Draw heatmap cells
  heatmapSvg.selectAll("rect.cell")
    .data(states)
    .enter()
    .append("rect")
    .attr("class", "cell")
    .attr("x", (d, i) => legendWidth + (i % cols) * cellSize)
    .attr("y", (d, i) => Math.floor(i / cols) * cellSize)
    .attr("width", cellSize)
    .attr("height", cellSize)
    .attr("fill", d => heatColorScale(stateCounts.get(d)))
    .attr("stroke", "#ccc");

  // Draw state labels
  heatmapSvg.selectAll("text.label")
    .data(states)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", (d, i) => legendWidth + (i % cols) * cellSize + cellSize / 2)
    .attr("y", (d, i) => Math.floor(i / cols) * cellSize + cellSize / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("font-size", "10px")
    .text(d => d);

  // Color legend on the LEFT
  const legendHeight = 200;
  const legendSteps = 6;
  const legendScale = d3.scaleLinear()
    .domain([0, maxCount])
    .range([legendHeight, 0]);

  const legendAxis = d3.axisRight(legendScale)
    .ticks(legendSteps)
    .tickFormat(d3.format("~s"));

  const legend = heatmapSvg.append("g")
    .attr("transform", "translate(50,100)");

  const legendGradient = heatmapSvg.append("defs")
    .append("linearGradient")
    .attr("id", "heat-gradient")
    .attr("x1", "0%")
    .attr("y1", "100%")
    .attr("x2", "0%")
    .attr("y2", "0%");

  const gradientSteps = d3.range(0, 1.01, 0.01);
  gradientSteps.forEach(t => {
    legendGradient.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", heatColorScale(t * maxCount));
  });

  legend.append("rect")
    .attr("width", 15)
    .attr("height", legendHeight)
    .style("fill", "url(#heat-gradient)");

  legend.append("g")
    .attr("transform", "translate(15,0)")
    .call(legendAxis);

  legend.append("text")
    .attr("x", -10)
    .attr("y", -10)
    .attr("text-anchor", "start")
    .attr("font-size", "12px")
    .text("Fires");
}

  const chartHeight = +causeSvg.attr("height") - chartMargin.top - chartMargin.bottom;

  const chartG = causeSvg.append("g")
    .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

  const xScale = d3.scaleBand().range([0, chartWidth]).padding(0.2);
  const yScale = d3.scaleLinear().range([chartHeight, 0]);

  const xAxisG = chartG.append("g").attr("transform", `translate(0,${chartHeight})`);
  const yAxisG = chartG.append("g");

  function updateCauseChart(data, year) {
    d3.select("#cause-year-label").text(year);

    const causeCounts = Array.from(
      d3.rollup(data, v => v.length, d => d.cause),
      ([cause, count]) => ({ cause, count })
    ).sort((a, b) => b.count - a.count);

    xScale.domain(causeCounts.map(d => d.cause));
    yScale.domain([0, d3.max(causeCounts, d => d.count)]);

    xAxisG.call(d3.axisBottom(xScale)).selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .style("font-size", "12px");

    yAxisG.call(d3.axisLeft(yScale));

    const bars = chartG.selectAll("rect").data(causeCounts, d => d.cause);

    bars.join(
      enter => enter.append("rect")
        .attr("x", d => xScale(d.cause))
        .attr("width", xScale.bandwidth())
        .attr("y", d => yScale(d.count))
        .attr("height", d => chartHeight - yScale(d.count))
        .attr("fill", "#FFA500")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
          const selectedYear = +yearSlider.property("value");
          renderHeatmapGrid(d.cause, selectedYear);
        }),
      update => update.transition().duration(300)
        .attr("y", d => yScale(d.count))
        .attr("height", d => chartHeight - yScale(d.count)),
      exit => exit.remove()
    );
  }

  function renderHeatmapGrid(cause, year) {
    d3.select("#heatmap-cause-label").text(`Selected Cause: ${cause} (${year})`);

    const data = fires.filter(d => d.year === year && d.cause === cause);
  
    const stateCounts = d3.rollup(data, v => v.length, d => d.state);
    const states = Array.from(stateCounts.keys()).sort();
    const counts = Array.from(stateCounts.values());
    const maxCount = d3.max(counts) || 1;
    heatColorScale.domain([0, maxCount]);
  
    const cols = 10;
    const cellSize = 50;
    const legendWidth = 100;
  
    heatmapSvg.selectAll("*").remove();
  
    // Draw heatmap cells
    heatmapSvg.selectAll("rect.cell")
      .data(states)
      .enter()
      .append("rect")
      .attr("class", "cell")
      .attr("x", (d, i) => legendWidth + (i % cols) * cellSize)
      .attr("y", (d, i) => Math.floor(i / cols) * cellSize)
      .attr("width", cellSize)
      .attr("height", cellSize)
      .attr("fill", d => heatColorScale(stateCounts.get(d)))
      .attr("stroke", "#ccc");
  
    // Draw state labels
    heatmapSvg.selectAll("text.label")
      .data(states)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr("x", (d, i) => legendWidth + (i % cols) * cellSize + cellSize / 2)
      .attr("y", (d, i) => Math.floor(i / cols) * cellSize + cellSize / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "10px")
      .text(d => d);
  
    // Color legend on the LEFT
    const legendHeight = 200;
    const legendSteps = 6;
    const legendScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range([legendHeight, 0]);
  
    const legendAxis = d3.axisRight(legendScale)
      .ticks(legendSteps)
      .tickFormat(d3.format("~s"));
  
    const legend = heatmapSvg.append("g")
      .attr("transform", "translate(50,20)");
  
    const legendGradient = heatmapSvg.append("defs")
      .append("linearGradient")
      .attr("id", "heat-gradient")
      .attr("x1", "0%")
      .attr("y1", "100%")
      .attr("x2", "0%")
      .attr("y2", "0%");
  
    const gradientSteps = d3.range(0, 1.01, 0.01);
    gradientSteps.forEach(t => {
      legendGradient.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", heatColorScale(t * maxCount));
    });
  
    legend.append("rect")
      .attr("width", 15)
      .attr("height", legendHeight)
      .style("fill", "url(#heat-gradient)");
  
    legend.append("g")
      .attr("transform", "translate(15,0)")
      .call(legendAxis);
  
    legend.append("text")
      .attr("x", -10)
      .attr("y", -10)
      .attr("text-anchor", "start")
      .attr("font-size", "12px")
      .text("Fires");
  }
  

  const initialYear = d3.min(years);
  renderFires(fires.filter(d => d.year === initialYear));
  updateCauseChart(fires.filter(d => d.year === initialYear), initialYear);

  yearSlider.on("input", function () {
    const selectedYear = +this.value;
    d3.select("#year-label").text(selectedYear);

    const filtered = fires.filter(d => d.year === selectedYear);
    renderFires(filtered);
    updateCauseChart(filtered, selectedYear);
  });

  let isPlaying = false;
  let animationInterval = null;
  const playButton = d3.select("#play-button");

  playButton.on("click", function () {
    isPlaying = !isPlaying;

    if (isPlaying) {
      playButton.text("⏸ Pause");

      let currentYear = +yearSlider.property("value");
      const maxYear = +yearSlider.attr("max");

      animationInterval = setInterval(() => {
        if (currentYear > maxYear) {
          clearInterval(animationInterval);
          playButton.text("▶ Play");
          isPlaying = false;
          return;
        }

        yearSlider.property("value", currentYear);
        d3.select("#year-label").text(currentYear);

        const filtered = fires.filter(d => d.year === currentYear);
        renderFires(filtered);
        updateCauseChart(filtered, currentYear);

        currentYear += 1;
      }, 700);
    } else {
      clearInterval(animationInterval);
      playButton.text("▶ Play");
    }
  });

    // === LEGEND FOR US MAP ===

    const colorLegendData = [
      { label: "Small (< 100 acres)", color: "green" },
      { label: "Medium (100–750 acres)", color: "yellow" },
      { label: "Large (750–50,000 acres)", color: "red" },
      { label: "Very Large (≥ 50,000 acres)", color: "black" }
    ];
  
    const colorLegend = d3.select("#color-legend")
      .append("svg")
      .attr("width", 180)
      .attr("height", 80);
  
    colorLegend.selectAll("g")
      .data(colorLegendData)
      .enter()
      .append("g")
      .attr("transform", (d, i) => `translate(0, ${i * 20})`)
      .each(function (d) {
        const g = d3.select(this);
        g.append("rect")
          .attr("x", 10)
          .attr("y", 0)
          .attr("width", 18)
          .attr("height", 18)
          .attr("fill", d.color);
        g.append("text")
          .attr("x", 35)
          .attr("y", 13)
          .text(d.label)
          .style("font-size", "12px");
      });
  
    const sizeLegendSVG = d3.select("#size-legend")
      .append("svg")
      .attr("width", 400)
      .attr("height", 100);
  
    const exampleSizes = [50, 500, 50000];
    const sizeScale = d => Math.log(d / 2 + 1);
  
    sizeLegendSVG.append("text")
      .attr("x", 130)
      .text("Circle size based on fire acreage")
      .attr("y", 15)
      .style("font-size", "12px");
  
    sizeLegendSVG.append("g")
      .attr("transform", "translate(50,0)")
      .selectAll("circle")
      .data(exampleSizes)
      .enter()
      .append("circle")
      .attr("cx", (d, i) => 50 + i * 100)
      .attr("cy", 50)
      .attr("r", d => sizeScale(d))
      .attr("fill", "#ccc")
      .attr("stroke", "#333");
  
    sizeLegendSVG.append("g")
      .attr("transform", "translate(50,0)")
      .selectAll("text.labels")
      .data(exampleSizes)
      .enter()
      .append("text")
      .attr("x", (d, i) => 50 + i * 100)
      .attr("y", 80)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .text(d => `${d} acres`);



}).catch(console.error);