// Define module using Universal Module Definition pattern
// https://github.com/umdjs/umd/blob/master/returnExports.js

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['d3', 'vega', 'vegalite', 'lodash', 'visgen', 'visrank'],factory);
  } else if (typeof exports === 'object') {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory(
      require('d3'),
      require('vega'),
      require('vegalite'),
      require('lodash'),
      require('visgen'),
      require('visrank')
    );
  } else {
    // Browser globals (root is window)
    factory(root.d3, root.vg, root.vl, root._, root.vgn, root.visrank);
  }
}(this, function(d3, vg, vl, _, vgn, visrank){
  var schema, col_indices;

  var HEIGHT_OFFSET = 60;

  var CONFIG = {
    showTable: false,

    genAggr: true,
    genBin: true,
    genTypeCasting: true,

    omitTranpose: true,
    omitDotPlotWithExtraEncoding: true,
    omitAggrWithAllDimsOnFacets: true
  }

  var keys = vg.keys;


  function getVLType(data_type){
    // return vegalite's data type
    var typeMap = {
      "categorical": "O",
      "geographic": "G",
      "quantitative": "Q",
      "datetime": "T",
      "count": "Q"
    };
    return typeMap[data_type];
  }

  // ----- load schema -----
  function loadSchema(){
    //TODO: use amd-plugin to load json, csv
    d3.json("data/birdstrikes/birdstrikes-schema.json", function(_schema) {
      //TODO: remove this line after updating csv.
      schema = _(_schema).filter(function(d){ return !d.disabled;})
        .sortBy('field_name')
        .sortBy(function(col){
          return getVLType(col.data_type) !== "Q" ? 0 :
            col.data_type === "count" ? 2 : 1 ;
        })
        .map(function(col, i){
          col.key = col['field_name'].replace(/(: )/g, "__").replace(/[\/ ]/g,"_").replace(/[()]/g, "");
          col.index = i; //add index
          return col;
        })
        .value();

      col_indices = _.reduce(schema, function(result, col, i){ result[col] = i; return result;}, {});

      console.log('schema keys', _.pluck(schema,'key').sort());
      console.log('data_types', _(schema).pluck('data_type').uniq().value());
      loadData();
    });
  }

  function updateSelectedFields(){
    var selectedColIndices = [];

    d3.selectAll("#datacols input.datacol").each(function(d, i){
      var selected = d3.select(this).node().checked;
      if(selected){
        selectedColIndices.push(d.index);
      }
    });

    renderMain(selectedColIndices);
  }

  function loadData(){
    // TODO: use other lib to load csv as columns?
    // TODO: regenerate csv with all columns
    d3.json("data/birdstrikes.json", function(data) {
      self.data = data;
      console.log("keys", vg.keys(data[0]));
      init();
    });
  }

  function init(){
    var datacols = d3.select("#datacols").selectAll("div")
      .data(schema).enter().append("div").append("label");

    datacols.append("input").attr("type","checkbox").attr("class","datacol")
      .on("change", updateSelectedFields);

    datacols.append("span").attr("class","type").text(function(d){
      return "["+getVLType(d.data_type)+"] ";
    });

    datacols.append("span").attr("class","name").html(function(d){
      return d.field_name;
    });

    // -----  Assume User Selection here -----

    // 0:O "Aircraft: Airline/Operator"
    // 1:O "Aircraft: Make/Model"
    // 2:O "Airport: Name"
    // 3:Q "Cost: Other"
    // 4:Q "Cost: Repair"
    // 5:Q "Cost: Total $"
    // 6:O "Effect: Amount of damage"
    // 7:T "Flight Date"
    // 8:# "Number of Strikes"
    // 9:G "Origin State"
    // 10:Q "Speed (IAS) in knots"
    // 11:O "When: Phase of flight"
    // 12:O "When: Time of day"
    // 13:O "Wildlife: Size"
    // 14:O "Wildlife: Species"

    // var colIndicesSet = [
    //   [6,5,4], //CxQxQ -- good except some bar + size
    //   [6,11,5], //CxCxQ
    //   [6,8], //Cx#
    //   [2,3], //C(Big)xQ
    //   [6, 10], //CxQ
    //   [6,8,5], //Cx#xG
    //   [10], //Q
    //   // [4,5], //QxQ
    //   // [7,8], //Dx#
    //   // [11,12,13], //OxOxO //FIXME
    //   //// [6,5,10] //CxQxQ //TODO: speed might be problematic
    // ];

    // var control = d3.select("#control");

    // var dsel = control.append("select")
    //   .attr("class", "data")
    //   .style("width", "300px")
    //   .on("change", function(){
    //     var index = this.options[this.selectedIndex].value;
    //     render(colIndicesSet[index])
    //   })
    //   .selectAll("option").data(colIndicesSet)
    //   .enter().append("option")
    //     .attr("value", function(d, i){ return i;})
    //     .attr("selected", function(d,i){ return i==0? true : undefined;})
    //     .text(function(d, i){ return getTitle(d);});

    // render(colIndicesSet[0])
  }

  function fieldDetails(v, type){
    return "<b>" +
      "<span class='fn'>" +
      (v.aggr ? v.aggr : "") +
      (v.bin ? " bin " : "") +
      "</span>" +
      "<span class='name'>" +
      (v.name || "") +
      "</span>" +
      "</b> ("+ (type || v.type) + ")";
  }

  function encodingDetails(enc, div){
    div.append("div").html("marktype: <b>"+enc.marktype()+"</b>");
    enc.forEach(function(k, v){
      div.append("div").html(k+": "+fieldDetails(v, vl.dataTypeNames[v.type]))
    });
  }

  function getTitle(colIndices){
    var cols = colIndices.map(function(i){ return schema[i];});

    return cols.map(function(col){
      return col['field_name'] + " [" + col['data_type'][0] +"]";
    }).join(",");
  }

  function getChartsByFieldSet(fields) {
    var aggr = vgn.genAggregate([], fields);
    var chartsByFieldset = aggr.map(function (fields) {
      var encodings = vgn.generateCharts(fields,
        {
          genAggr: false
        },
        {
          dataUrl: "data/birdstrikes.json",
          viewport: [460, 460]
        },
        true
      ).map(function (e) { //add score
          var score = visrank.encodingScore(e);
          e.score = score.score;
          e.scoreFeatures = score.features;
          return e;
        });

      var diff = vgn.getDistanceTable(encodings),
        clusters = vgn.cluster(encodings, 2.5)
          .map(function (cluster) {
            return cluster.sort(function (i, j) {
              return encodings[j].score - encodings[i].score;
            });
          })
          .sort(function (c1, c2) {
            return encodings[c2[0]].score - encodings[c1[0]].score;
          });

      //console.log("clusters", clusters);

      return {
        fields: fields,
        encodings: encodings,
        diff: diff,
        clusters: clusters
      };

    })
    return chartsByFieldset;
  }

  function renderMain(selectedColIndices){
    if(selectedColIndices.length === 0) return;

    var selectedCols = selectedColIndices.map(function(i){ return schema[i];}),
      selectedColNames = _.pluck(selectedCols, 'field_name'),
      selectedColTypes = _.pluck(selectedCols, 'data_type');

    // ----- Generate Charts -----
    //TODO(kanitw): change schema format to match
    var fields = selectedCols.map(function(col){
      if(col.data_type == "count"){
        return {aggr: "count", type:"Q"};
      }
      var type = getVLType(col.data_type), f;
      switch(type){

        case "Q":
          f = {name: col.key, type: "Q", _aggr:"*"}
          return f;
        case "O":
        default:
          return {name: col.key, type:"O"};
      }
    });

    console.log('fields', JSON.stringify(fields));

    var chartsByFieldSet = getChartsByFieldSet(fields);

    d3.select("#aggr").selectAll("*").remove();
    d3.select("#vis").selectAll("*").remove();

    var aggrTable = d3.select("#aggr").selectAll("div.fieldset");

    var enter = aggrTable.data(chartsByFieldSet).enter()
      .append("div").attr("class", "fieldset");

    // data fields
    enter.append("div").attr("class", "datafields")
      .selectAll("div.datafield").data(function(d){return d.fields;})
      .enter().append("div").attr("class", "datafield")
      .html(fieldDetails);

    // top vis
    enter.append("div").attr("class","topvis")
      .each(renderTopVis);

    enter.append("div").attr("class", "select")
      .append("a").attr("href","#").text("expand")
        .on('click', function(d){
          renderVisVariations(d)
        });

    // console.log("chartsByFieldset", chartsByFieldset);
    // chartsByFieldset.forEach(renderCharts);
  }

  var topVisId = 0; //HACK

  function renderTopVis(charts){
    var container = d3.select(this),
      clusters = charts.clusters,
      encodings = charts.encodings;

    if(clusters.length == 0 || clusters[0].length===0) return;

    var id = "topvis-" + (topVisId++);

    var topIdx = clusters[0][0],
      encoding = vl.Encoding.parseJSON(encodings[topIdx]),
      spec = vl.toVegaSpec(encoding, data);

    appendVis(container, encoding, spec, id);
  }

  function appendVis(container, encoding, spec, id){
    container.append("div").attr("id", id)
      .style({"height": (+spec.height + HEIGHT_OFFSET) + "px", "overflow": "hidden"});

    if (spec){
      vg.parse.spec(spec, function (vgChart) {
        var vis = vgChart({el: '#' + id});
        vis.update();
      });
    }

    container.append("input").attr({"readonly":1, value: encoding.toShorthand(), class:"shorthand"})
      .style("font-size", "12px");
  }

  function renderVisVariations(charts, groupId) {
    var encodings = charts.encodings,
      diff = charts.diff,
      clusters = charts.clusters;

    var content = d3.select("#vis");
    content.selectAll("*").remove();
    var visIdCounter=0;

    var fields = vl.vals(encodings[0].enc);
    var groupname = fields.map(function(v){
      return (v.aggr ? v.aggr+"_" : "") +
        (v.bin ? "bin_" : "") +
        v.name +
        "(" + v.type + ")";
    }).join(" / ");

    content.append("h2").text(groupname);

    if(CONFIG.showTable){
      renderDistanceTable(content, diff);
    }

    // return;



    clusters.forEach(function (clusterIndices) {
      var cluster = clusterIndices.map(function (i) {
        var e = encodings[i],
          encoding = vl.Encoding.parseJSON(e),
          spec = vl.toVegaSpec(encoding, data);
        return {
          encodingJson: e,
          encoding: encoding,
          spec: spec,
          i: i
        };
      });

      var clusterHeight = cluster.reduce(function (h, c) {
        var nh = +c.spec.height + HEIGHT_OFFSET + 120;
        return nh > h ? nh : h;
      }, 0)

      var chartGroupDiv = content.append("div")
        .attr("id", "group")
        .attr("class", "row")
        .style({
          "background-color": "#fcfcfc",
          "overflow-x": "scroll",
          "overflow-y": "hidden",
          "margin-bottom": "20px",
          "white-space": "nowrap",
          "height": clusterHeight + "px"
        });

      cluster.forEach(function (o, i) {
        if(CONFIG.showOnlyClusterTop && i>0) return;
        // console.log('chart', chart, chart.toShorthand());
        var encodingJson = o.encodingJson,
          i = o.i,
          id = 'vis-' + groupId + "-" + (visIdCounter++),
          encoding = o.encoding,
          spec = o.spec;

        var chartDiv = chartGroupDiv.append("div")
          .style({
            "display": "inline-block",
            "margin-right": "10px",
            "vertical-align": "top"
          })
        var detail = chartDiv.append("div").text("id:"+i+", score:"+encodingJson.score).append("div");
        encodingDetails(encoding, detail);

        appendVis(chartDiv, encoding, spec, id);
      });
    })
  }

  function renderDistanceTable(content, diff) {
    var table = content.append("table");
    var headerRow = table.append("tr").attr("class", "header-row");
    headerRow.append("th");
    headerRow.selectAll("th.item-col").data(diff)
      .enter().append("th").attr("class", "item-col")
      .append("b").text(function (d, i) {
        return "" + i;
      });

    var rows = table.selectAll("tr.item-row")
      .data(diff)
      .enter().append("tr").attr("class", "item-row");

    rows.append("td").append("b").text(function (d, i) {
      return i;
    });
    rows.selectAll("td.item-cell")
      .data(_.identity)
      .enter().append("td").attr("class", "item-cell")
      .style("text-align", "center")
      .style("border", "1px solid #ddd")
      .text(function (d) {
        return d ? d3.format('.2')(d) : "-";
      });
  }

  loadSchema();
}));