// +------------------------------------------------------------+
//   Model: Simple Dividend Discount Model
//   Copyright: https://discountingcashflows.com, 2022
// +------------------------------------------------------------+

var INPUT = Input({_DISCOUNT_RATE: '',
                   EXPECTED_DIVIDEND: '',
                   _GROWTH_IN_PERPETUITY: '',
                   _LINEAR_REGRESSION_WEIGHT: 50,
                   BETA:'',
                   _RISK_FREE_RATE: '',
                   _MARKET_PREMIUM: 5,
                   HISTORIC_YEARS: ''});  

function getGrowthRateList(values, mode){
  var growthRateList = [];
  if(values.length > 1){
    if(mode == 'percentage'){growthRateList.push('');}
    else{growthRateList.push(0);}
    
    var val1 = values[0];
    for(var i=1; i<values.length; i++){
      var val2 = values[i];
      if(mode == 'percentage'){
        growthRateList.push( (100*(val2-val1)/val1).toFixed(2) + '%' );
      }
      else{
        growthRateList.push((val2-val1)/val1);
      }
      val1=val2;
    }
  }
  return growthRateList;
}

// Returns the index at which flows period has a zero dividend
function getZeroDividendIndex(flows){
  for(var i=0; i<flows.length; i++){
    if(flows[i]['dividendsPaid'] == 0){
    	return i;
    }
  }
  return flows.length - 1;
}

$.when(
  get_income_statement(),
  get_income_statement_ltm(),
  get_balance_sheet_statement(),
  get_balance_sheet_statement_quarterly(),
  get_cash_flow_statement(),
  get_cash_flow_statement_ltm(),
  get_profile(),
  get_dividends_annual(),
  get_prices_annual(),
  get_treasury()).done(
  function(_income, _income_ltm, _balance, _balance_quarterly, _flows, _flows_ltm, _profile, _dividends, _prices, _treasury){
    var income = JSON.parse(JSON.stringify(_income));
    var income_ltm = JSON.parse(JSON.stringify(_income_ltm));
    var balance = JSON.parse(JSON.stringify(_balance));
    var balance_quarterly = JSON.parse(JSON.stringify(_balance_quarterly));
    var flows = JSON.parse(JSON.stringify(_flows));
    var flows_ltm = JSON.parse(JSON.stringify(_flows_ltm));
    var profile = JSON.parse(JSON.stringify(_profile));
    var treasury = JSON.parse(JSON.stringify(_treasury));
    var dividends = JSON.parse(JSON.stringify(_dividends));
    var prices = JSON.parse(JSON.stringify(_prices));
    var context = [];
    var chartProjectionYears = 5;
    var zeroDividendIndex = getZeroDividendIndex(flows[0]);
    if(!zeroDividendIndex){
    	warning("The company does not currently pay dividends!");
    }
    if(zeroDividendIndex > 10){
      zeroDividendIndex = 10;
    }
    
    setInputDefault('HISTORIC_YEARS', zeroDividendIndex);
    setInputDefault('_GROWTH_IN_PERPETUITY', treasury[0][0].year10);
    
    flows = flows[0].slice(0, INPUT.HISTORIC_YEARS);
    income = income[0].slice(0, INPUT.HISTORIC_YEARS);
    balance = balance[0].slice(0, INPUT.HISTORIC_YEARS);
    balance_quarterly = balance_quarterly[0][0];
    profile = profile[0][0];
    income_ltm = income_ltm[0];
    flows_ltm = flows_ltm[0];
    prices = prices[0];
    dividends = dividends[0].slice(0, INPUT.HISTORIC_YEARS + 1);
    var linDividends = linearRegressionGrowthRate('adjDividend', dividends, chartProjectionYears - 1, 1);

    var currency = '';
    var currencyProfile = '';
    if('convertedCurrency' in profile){
		currencyProfile = profile['convertedCurrency'];
	}else{
		currencyProfile = profile['currency'];
	}
	if('convertedCurrency' in flows[0]){
		currency = flows[0]['convertedCurrency'];
	}else{
		currency = flows[0]['reportedCurrency'];
	}
    if( currencyProfile != currency ){
    	warning("The market price currency(" + currencyProfile + ") and the financial report's currency(" + currency + ") do not match! Please select a curreny from the top right menu.");
    }
    
    if(profile.beta){
    	setInputDefault('BETA', profile.beta);
    }
    else{
    	setInputDefault('BETA', 1);
    }
	setInputDefault('_RISK_FREE_RATE', treasury[0][0].year10);
    setInputDefault('_DISCOUNT_RATE', 100*(INPUT._RISK_FREE_RATE + INPUT.BETA * INPUT._MARKET_PREMIUM));
    
    // price is the Current Last Price of a Share on the Stock Market
    var price = profile['price'];

    // dgr stores the Historic Dividend Growth Rate
    var dgr = 0;
    // d1 stores the previous period Dividend
    var d1 = 0;
    // d0 stores the current period Dividend
    var d0 = dividends[0].adjDividend;
    if(d0 == 0){
        warning("A zero dividend was encountered!");
      	_StopIfWatch(0, currency);
        return;
    }
    var growthRates = [];
    // Calculate the Average Annual Dividend Growth Rate for the last HISTORIC_YEARS
    for(var i=1; i<dividends.length; i++){
      d1 = dividends[i].adjDividend;
      if(d1 == 0){
        warning("A zero dividend was encountered!");
        _StopIfWatch(0, currency);
        return;
      }
      dgr += (d0 - d1) / d1;
      growthRates.push(Number((100*(d0 - d1) / d1).toFixed(2)));
      d0 = d1;
    }
	dgr = dgr/( dividends.length - 1 );
    var expectedDividend = INPUT._LINEAR_REGRESSION_WEIGHT * linDividends[dividends.length - 1] + (1-INPUT._LINEAR_REGRESSION_WEIGHT) * dividends[0].adjDividend
    setInputDefault('EXPECTED_DIVIDEND', expectedDividend);
    
    // The final value calculated by the Dividend Discount Model
    var valueOfStock = INPUT.EXPECTED_DIVIDEND / (INPUT._DISCOUNT_RATE - INPUT._GROWTH_IN_PERPETUITY);
    
    // If we are calculating the value per share for a watch, we can stop right here.
    if(_StopIfWatch(valueOfStock, currency)){
      return;
    }
    
    _SetEstimatedValue(valueOfStock, currency);
    print(dividends[0].adjDividend, "LTM Dividend(" + currency + ")", '#');
    print(linDividends[dividends.length - 1], "Next Linear Regression Dividend(" + currency + ")", '#');
    print(INPUT.EXPECTED_DIVIDEND, "Next Year's Expected Dividend(" + currency + ")", '#');
    print(dgr, "Average Historic Dividend Growth Rate", '%');
    print(valueOfStock, "Value of Stock (" + currency + ")", '#');
    print(price, "Current Price (" + currency + ")");
    
    var result = '';
    
    // Create Chart for X Years of Previous Dividends 
    var y_values = [];
    for(var i = INPUT.HISTORIC_YEARS; i >= 1; i--){
      y_values.push(Math.abs(dividends[i].adjDividend));
    }
    y_values.push(INPUT.EXPECTED_DIVIDEND);
    // Append estimations
    var lastYearDate = parseInt(flows[0]['date']);
    for(var i = 1; i < chartProjectionYears; i++){
      y_values.push(INPUT.EXPECTED_DIVIDEND * Math.pow(1 + INPUT._GROWTH_IN_PERPETUITY, i));
    }
    fillHistoricUsingList(y_values, 'dividends', parseInt(flows[0]['date']) + chartProjectionYears + 1);
    fillHistoricUsingList(linDividends, 'linear regression', parseInt(flows[0]['date']) + chartProjectionYears + 1);
    
    // Dividend Table
    var rows = ['Dividends', 'Growth Rates'];
    var columns = [];
    var data = [y_values, getGrowthRateList(y_values, 'percentage')];
    for(var i=1; i<=chartProjectionYears + INPUT.HISTORIC_YEARS; i++){
      columns.push(lastYearDate - INPUT.HISTORIC_YEARS + i);
    }
    contextItem = {name:'Historic and Projected Dividends (' + currency + ')', display:'table', rows:rows, columns:columns, data:data};
    context.push(contextItem);
    
    var sensitivity = 0.05;
    var prefDividendsRatio = Math.abs((Math.abs(flows[0].dividendsPaid) - dividends[1].adjDividend * income[0].weightedAverageShsOut) / flows[0].dividendsPaid);
    // if the last period has considerable preferred dividends (meaning that the company has pref. stock issued)
    if( prefDividendsRatio > sensitivity ){
      var rows = ['Net income','Calculated preferred stock dividends & premiums','Net income available to common shareholders', 'Equity', 'Return on equity', 'Dividends paid to common shareholders', 
                  'Payout ratio (common)', 'Shares outstanding', 'Reference market share price', 'Earnings per share(EPS)',
                  'Dividends per share', 'Dividend yield'];
      var columns = [];
      var data = [];
      for(var i=0; i<rows.length; i++){
          data.push([]);
      }

      var lengths = [income.length, balance.length, flows.length];
      var maxLength = INPUT.HISTORIC_YEARS;
      for(var i in lengths){
        if(lengths[i] < maxLength){
          maxLength = lengths[i];
        }
      }

      for(var i=1; i<=maxLength; i++){
        var i_inverse = maxLength - i;
        var col = 0;
        columns.push(lastYearDate - i_inverse);
        // Net Income
        data[col++].push( toM(income[i_inverse].netIncome) );
        var preferredStockDividends = Math.abs(flows[i_inverse].dividendsPaid) - dividends[i_inverse + 1].adjDividend * income[i_inverse].weightedAverageShsOut;
        if(preferredStockDividends < 0){
          warning("Preferred stock dividends for year " + (lastYearDate - i_inverse) + " are negative! Shares outstanding may not be inline with the ones reported. Please submit this using the feedback menu. Thanks!");
        }
        // Preferred stock dividends
        data[col++].push( toM(preferredStockDividends).toFixed(2) );
        // Net Income available to common shareholders
        data[col++].push( toM(income[i_inverse].netIncome - preferredStockDividends).toFixed(2) );
        // Equity
        data[col++].push( toM(balance[i_inverse].totalStockholdersEquity) );
        // Return on Equity
        data[col++].push( (100 * (flows[i_inverse].netIncome/balance[i_inverse].totalStockholdersEquity)).toFixed(2) + '%' );
        // Dividends paid to common
        data[col++].push( toM(dividends[i_inverse + 1].adjDividend * income[i_inverse].weightedAverageShsOut).toFixed(2) ); 
        // Common stock payout Ratio
        data[col++].push( (100 * dividends[i_inverse + 1].adjDividend * income[i_inverse].weightedAverageShsOut /(income[i_inverse].netIncome - preferredStockDividends) ).toFixed(2) + '%' );
        // data[col++].push( (100 * dividends[i_inverse + 1].adjDividend/income[i_inverse].eps).toFixed(2) + '%' );
        // Shares Outstanding
        data[col++].push( toM(income[i_inverse].weightedAverageShsOut).toFixed(2) );
        // Market Price per Share
        data[col++].push(prices[i_inverse + 1]['close'] );
        // EPS
        data[col++].push( income[i_inverse].eps );
        // Dividends per Share
        data[col++].push( dividends[i_inverse + 1].adjDividend );
        // Dividend Yield
        data[col++].push( (100*dividends[i_inverse + 1].adjDividend/prices[i_inverse + 1]['close']).toFixed(2) + '%' );
      }
      // append LTM values
      columns.push('LTM');
      var col = 0;
      // Net Income
      data[col++].push( toM(income_ltm.netIncome) );
      var preferredStockDividends = -flows_ltm.dividendsPaid - dividends[0].adjDividend * income_ltm.weightedAverageShsOut;
      // Preferred stock dividends
      data[col++].push( toM(preferredStockDividends).toFixed(2) );
      // Net Income available to common shareholders
      data[col++].push( toM(income_ltm.netIncome - preferredStockDividends).toFixed(2) );
      // Equity
      data[col++].push( toM(balance_quarterly.totalStockholdersEquity) );
      // Return on Equity
      data[col++].push( (100 * income_ltm.netIncome / balance_quarterly.totalStockholdersEquity).toFixed(2) + '%' );
      // Dividends paid to common
      data[col++].push( toM(dividends[0].adjDividend * income_ltm.weightedAverageShsOut).toFixed(2) ); 
      // Common stock payout Ratio
      data[col++].push( (100 * dividends[0].adjDividend * income_ltm.weightedAverageShsOut /(income_ltm.netIncome - preferredStockDividends) ).toFixed(2) + '%' );
      // data[col++].push( (100 * dividends[i_inverse + 1].adjDividend/income[i_inverse].eps).toFixed(2) + '%' );
      // Shares Outstanding
      data[col++].push( toM(income_ltm.weightedAverageShsOut).toFixed(2) );
      // Market Price per Share
      data[col++].push(prices[0]['close'] );
      // EPS
      data[col++].push( income_ltm.eps );
      // Dividends per Share
      data[col++].push( dividends[0].adjDividend );
      // Dividend Yield ltm
      data[col++].push( (100*dividends[0].adjDividend/prices[0]['close']).toFixed(2) + '%' );


      contextItem = {name:'Historic figures (Mil. ' + currency + ' except per share items)', display:'table', rows:rows, columns:columns, data:data};
    }
    else{
      var rows = ['Net income', 'Equity', 'Return on equity', 'Dividends paid', 
                  'Payout ratio', 'Shares outstanding', 'Reference market share price', 'Earnings per share(EPS)',
                  'Dividends per share', 'Dividend yield'];
      var columns = [];
      var data = [];
      for(var i=0; i<rows.length; i++){
          data.push([]);
      }

      var lengths = [income.length, balance.length, flows.length];
      var maxLength = INPUT.HISTORIC_YEARS;
      for(var i in lengths){
        if(lengths[i] < maxLength){
          maxLength = lengths[i];
        }
      }

      for(var i=1; i<=maxLength; i++){
        var i_inverse = maxLength - i;
        var col = 0;
        columns.push(lastYearDate - i_inverse);
        // Net Income
        data[col++].push( toM(income[i_inverse].netIncome) );
        // Equity
        data[col++].push( toM(balance[i_inverse].totalStockholdersEquity) );
        // Return on Equity
        data[col++].push( (100 * (flows[i_inverse].netIncome/balance[i_inverse].totalStockholdersEquity)).toFixed(2) + '%' );
        // Dividends paid
        data[col++].push( toM(dividends[i_inverse + 1].adjDividend * income[i_inverse].weightedAverageShsOut) ); 
        // Common stock payout Ratio
        data[col++].push( (100 * dividends[i_inverse + 1].adjDividend * income[i_inverse].weightedAverageShsOut /income[i_inverse].netIncome ).toFixed(2) + '%' );
        // data[col++].push( (100 * dividends[i_inverse + 1].adjDividend/income[i_inverse].eps).toFixed(2) + '%' );
        // Shares Outstanding
        data[col++].push( toM(income[i_inverse].weightedAverageShsOut).toFixed(2) );
        // Market Price per Share
        data[col++].push(prices[i_inverse + 1]['close'] );
        // EPS
        data[col++].push( income[i_inverse].eps );
        // Dividends per Share
        data[col++].push( dividends[i_inverse + 1].adjDividend );
        // Dividend Yield
        data[col++].push( (100*dividends[i_inverse + 1].adjDividend/prices[i_inverse + 1]['close']).toFixed(2) + '%' );
      }
      // append LTM values
      columns.push('LTM');
      var col = 0;
      // Net Income
      data[col++].push( toM(income_ltm.netIncome) );
      // Equity
      data[col++].push( toM(balance_quarterly.totalStockholdersEquity) );
      // Return on Equity
      data[col++].push( (100 * income_ltm.netIncome / balance_quarterly.totalStockholdersEquity).toFixed(2) + '%' );
      // Dividends paid to common
      data[col++].push( toM(dividends[0].adjDividend * income_ltm.weightedAverageShsOut) ); 
      // Common stock payout Ratio
      data[col++].push( (100 * dividends[0].adjDividend * income_ltm.weightedAverageShsOut /(income_ltm.netIncome) ).toFixed(2) + '%' );
      // data[col++].push( (100 * dividends[i_inverse + 1].adjDividend/income[i_inverse].eps).toFixed(2) + '%' );
      // Shares Outstanding
      data[col++].push( toM(income_ltm.weightedAverageShsOut).toFixed(2) );
      // Market Price per Share
      data[col++].push(prices[0]['close'] );
      // EPS
      data[col++].push( income_ltm.eps );
      // Dividends per Share
      data[col++].push( dividends[0].adjDividend );
      // Dividend Yield ltm
      data[col++].push( (100*dividends[0].adjDividend/prices[0]['close']).toFixed(2) + '%' );


      contextItem = {name:'Historic figures (Mil. ' + currency + ' except per share items)', display:'table', rows:rows, columns:columns, data:data};
    }
    context.push(contextItem);
    
    renderChart('Historic and Projected Dividends(Mil. ' + currency + ')');
    monitor(context);
});

var DESCRIPTION = Description(`
								<h5>Simple Dividend Discount Model</h5>
								Used to estimate the value of a company's stock based on the theory that it is worth the sum of all of its future dividend payments when discounted back to their present value. 
								<p>Reference: <a href='https://www.investopedia.com/terms/d/ddm.asp' target='_blank'>www.investopedia.com</a></p>
                                `, `
                                <p>User Inputs Description:</p>
                                <ul>
                                  <li><b>Discount Rate:</b> By default, the discount rate is the cost of equity. Calculated using the formula:</li>
                                </ul>
                                <div class="d-block text-center my-2">
                                \\( Discount Rate = Cost Of Equity = \\) \\( RiskFreeRate + Beta * MarketPremium \\)
                                </div>
                                <ul>
                                  <li><b>Expected Dividend:</b> The estimated sum dividend that the company will pay up until next year, influenced by the linear regression of dividends and LTM dividend. Calculated using: </li>
                                </ul>
                                <div class="d-block text-center my-2">
                                \\( Expected Dividend = LinearRegressionWeight * NextLinearRegressionDividend \\) \\( + (1 - LinearRegressionWeight) * LTMDividend  \\)
                                </div>
                                <ul>
                                  <li><b>Growth in Perpetuity:</b> Growth rate at which the dividends are expected to grow in perpetuity</li>
                                  <li><b>Linear Regression Weight:</b> Used to calculate the expected dividend.</li>
                                  <li><b>Beta, Risk Free Rate, Market Premium:</b> Used to calculate the Cost of equity.</li>
                                  <li><b>Historic Years:</b> Past years used to calculate the average dividend growth rate</li>
                                </ul>
                                <p>Formula used to calculate Value of Stock:</p>
                                <div class="d-block text-center my-2">
                                \\( ValueOfStock = \\) \\( ExpectedDividendPerShare \\over (DiscountRate - GrowthInPerpetuity) \\)
                                </div>
`);